import { app } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import type { EyeStatus } from '../../shared/types';
import { ensureSidecarReady } from './sidecarSetup';

type RequestType = 'analyze' | 'face_eye' | 'aesthetics';

interface SidecarResponse {
  id: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

interface Pending {
  resolve: (r: Record<string, unknown>) => void;
  reject: (e: Error) => void;
}

/** A single Python worker process plus its in-flight request bookkeeping. */
interface Worker {
  proc: ChildProcess;
  pending: Map<string, Pending>;
  buf: string;
}

function poolSize(): number {
  const env = Number(process.env.PHOTOSTARS_SIDECAR_POOL);
  if (Number.isFinite(env) && env >= 1) return Math.floor(env);
  const cpus = os.cpus()?.length ?? 4;
  // Each worker loads mediapipe + a model (memory-heavy), so cap modestly.
  return Math.max(1, Math.min(3, cpus - 1));
}

/** Directory containing analyzer.py + requirements.txt + model files. */
function sidecarDir(): string {
  // Packaged: files are copied next to the compiled JS, but unpacked from asar
  // so the external Python process can read them (see asarUnpack in builder cfg).
  const prodDir = __dirname.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  if (fs.existsSync(path.join(prodDir, 'analyzer.py'))) return prodDir;
  // Dev: look in the source tree.
  return path.join(app.getAppPath(), 'src', 'main', 'sidecar');
}

function toEyeStatus(r: Record<string, unknown>): EyeStatus {
  return {
    facesDetected: (r['facesDetected'] as number)  ?? 0,
    allEyesOpen:   (r['allEyesOpen']   as boolean) ?? true,
    smileScore:    r['smileScore']   as number | undefined,
    mouthOpen:     r['mouthOpen']    as boolean | undefined,
    headTiltDeg:   r['headTiltDeg']  as number | undefined,
    badExpression: (r['badExpression'] as boolean) ?? false,
    faceBbox:      r['faceBbox']     as import('../../shared/types').FaceBbox | undefined,
    eyeBbox:       r['eyeBbox']      as import('../../shared/types').EyeBbox  | undefined,
  };
}

export interface CombinedAnalysis {
  eyeStatus: EyeStatus;
  aestheticsScore: number;
}

export class SidecarManager {
  private workers: Worker[] = [];

  private starting = false;

  /**
   * Provision the sidecar venv on first run (downloads uv + Python + deps),
   * then spawn the worker pool. Runs asynchronously: the UI loads immediately
   * and analysis requests made before the pool is ready reject gracefully
   * (callers in analyze.ts already treat that as "sidecar unavailable").
   */
  start(): void {
    if (this.workers.length > 0 || this.starting) return;
    this.starting = true;

    const dir = sidecarDir();
    const scriptPath = path.join(dir, 'analyzer.py');
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[sidecar] analyzer.py not found at ${scriptPath}; face/eye and aesthetics disabled`);
      this.starting = false;
      return;
    }

    void ensureSidecarReady(path.join(dir, 'requirements.txt'))
      .then((bin) => {
        const n = poolSize();
        console.log(`[sidecar] spawning ${String(n)} worker(s): ${bin} ${scriptPath}`);
        for (let i = 0; i < n; i++) {
          const w = this.spawnWorker(bin, scriptPath);
          if (w) this.workers.push(w);
        }
      })
      .catch((err: unknown) => {
        console.error('[sidecar] setup failed; face/eye and aesthetics disabled:',
          err instanceof Error ? err.message : String(err));
      })
      .finally(() => { this.starting = false; });
  }

  private spawnWorker(bin: string, scriptPath: string): Worker | null {
    const proc = spawn(bin, [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    const worker: Worker = { proc, pending: new Map(), buf: '' };

    proc.stderr!.on('data', (chunk: Buffer) => {
      process.stderr.write(`[sidecar] ${chunk.toString()}`);
    });

    proc.stdout!.on('data', (chunk: Buffer) => {
      worker.buf += chunk.toString();
      const lines = worker.buf.split('\n');
      worker.buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as SidecarResponse;
          const p = worker.pending.get(msg.id);
          if (!p) continue;
          worker.pending.delete(msg.id);
          if (msg.success) p.resolve(msg.result ?? {});
          else p.reject(new Error(msg.error ?? 'sidecar error'));
        } catch {}
      }
    });

    const fail = (err: Error): void => {
      this.workers = this.workers.filter((x) => x !== worker);
      for (const [, p] of worker.pending) p.reject(err);
      worker.pending.clear();
    };

    proc.on('exit', (code, signal) => {
      console.warn(`[sidecar] worker exited code=${String(code)} signal=${String(signal)}`);
      fail(new Error('sidecar process exited'));
    });

    proc.on('error', (err) => {
      console.error('[sidecar] spawn error:', err.message);
      fail(err);
    });

    return worker;
  }

  /** Dispatch to the live worker with the fewest in-flight requests. */
  private send(type: RequestType, imagePath: string): Promise<Record<string, unknown>> {
    const live = this.workers.filter((w) => !w.proc.killed);
    if (live.length === 0) return Promise.reject(new Error('sidecar not running'));
    const worker = live.reduce((a, b) => (b.pending.size < a.pending.size ? b : a));
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      worker.pending.set(id, { resolve, reject });
      worker.proc.stdin!.write(JSON.stringify({ id, type, image_path: imagePath }) + '\n');
    });
  }

  /** Single round-trip that returns both face/eye and aesthetics. */
  async analyze(imagePath: string): Promise<CombinedAnalysis> {
    const r = await this.send('analyze', imagePath);
    return {
      eyeStatus:       toEyeStatus(r),
      aestheticsScore: (r['aestheticsScore'] as number) ?? 5,
    };
  }

  async analyzeFaceEye(imagePath: string): Promise<EyeStatus> {
    return toEyeStatus(await this.send('face_eye', imagePath));
  }

  async analyzeAesthetics(imagePath: string): Promise<number> {
    const r = await this.send('aesthetics', imagePath);
    return (r['aestheticsScore'] as number) ?? 5;
  }

  shutdown(): void {
    for (const w of this.workers) {
      if (!w.proc.killed) {
        w.proc.stdin?.end();
        w.proc.kill();
      }
    }
    this.workers = [];
  }
}

export const sidecar = new SidecarManager();
