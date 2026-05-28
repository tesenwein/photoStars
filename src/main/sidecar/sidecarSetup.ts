import { app } from 'electron';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * First-run provisioning for the Python sidecar.
 *
 * Uses `uv` (a single self-contained binary) to download a pinned CPython 3.12
 * and create an isolated venv in the app's data dir, then installs the sidecar's
 * runtime requirements (opencv / mediapipe / onnxruntime / numpy). The user
 * never installs Python or pip packages by hand — this runs automatically on
 * first launch and is a no-op on every launch thereafter.
 *
 * The model files (nima.onnx, face_landmarker.task) are produced at BUILD time
 * and shipped next to analyzer.py, so no heavyweight torch install happens here.
 */

const VENV_DIR_NAME = 'sidecar-venv';
const PYTHON_VERSION = '3.12';

function venvDir(): string {
  return path.join(app.getPath('userData'), VENV_DIR_NAME);
}

/** Path to the venv's Python interpreter, OS-specific. */
export function venvPython(): string {
  return process.platform === 'win32'
    ? path.join(venvDir(), 'Scripts', 'python.exe')
    : path.join(venvDir(), 'bin', 'python');
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stdout?.on('data', (c: Buffer) => process.stdout.write(`[sidecar-setup] ${c.toString()}`));
    proc.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); process.stderr.write(`[sidecar-setup] ${c.toString()}`); });
    proc.on('error', reject);
    proc.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${String(code)}: ${stderr.slice(-500)}`)));
  });
}

/** Locate the uv binary, installing it if absent. Returns an absolute path. */
async function ensureUv(): Promise<string> {
  const exe = process.platform === 'win32' ? 'uv.exe' : 'uv';
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', exe),
    path.join(os.homedir(), '.cargo', 'bin', exe),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  console.log('[sidecar-setup] uv not found — installing');
  if (process.platform === 'win32') {
    await run('powershell', ['-ExecutionPolicy', 'Bypass', '-Command',
      'irm https://astral.sh/uv/install.ps1 | iex']);
  } else {
    await run('sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh']);
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('uv installation did not produce a binary in the expected location');
}

let readyPromise: Promise<string> | null = null;

/**
 * Ensure the sidecar venv exists and has its dependencies. Idempotent and
 * memoized: concurrent callers share one provisioning run. Resolves to the
 * venv Python path.
 */
export function ensureSidecarReady(requirementsPath: string): Promise<string> {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const py = venvPython();
    if (fs.existsSync(py)) return py;

    const uv = await ensureUv();
    console.log('[sidecar-setup] creating venv + installing deps (first run, may take a few minutes)');
    await run(uv, ['venv', '--python', PYTHON_VERSION, venvDir()]);
    await run(uv, ['pip', 'install', '--python', py, '-r', requirementsPath]);
    console.log('[sidecar-setup] sidecar environment ready');
    return py;
  })().catch((err: unknown) => {
    readyPromise = null; // allow retry on next launch
    throw err;
  });

  return readyPromise;
}
