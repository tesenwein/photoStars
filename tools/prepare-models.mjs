// Build-time model preparation for the PhotoStars sidecar.
//
// Produces the two model files that ship next to analyzer.py but are NOT
// committed to git:
//   - nima.onnx          (converted from the published NIMA checkpoint via uv)
//   - face_landmarker.task (downloaded from Google's mediapipe model store)
//
// Run automatically as part of `pnpm build`. Requires `uv` (auto-located in
// PATH or ~/.local/bin). Idempotent: skips files that already exist.

import { existsSync, mkdirSync, createWriteStream } from 'fs';
import { spawnSync } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import https from 'https';

const SIDECAR_DIR = 'src/main/sidecar';
const NIMA_OUT = path.join(SIDECAR_DIR, 'nima.onnx');
const LANDMARKER_OUT = path.join(SIDECAR_DIR, 'face_landmarker.task');
const LANDMARKER_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

function findUv() {
  const exe = process.platform === 'win32' ? 'uv.exe' : 'uv';
  const candidates = [
    exe, // PATH
    path.join(homedir(), '.local', 'bin', exe),
    path.join(homedir(), '.cargo', 'bin', exe),
  ];
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { stdio: 'ignore' });
    if (r.status === 0) return c;
  }
  console.error('[prepare-models] uv not found. Install it: https://docs.astral.sh/uv/');
  process.exit(1);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`GET ${url} -> ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', reject);
  });
}

mkdirSync(SIDECAR_DIR, { recursive: true });

// 1. NIMA -> ONNX (one-time torch install lives in an ephemeral uv env).
if (existsSync(NIMA_OUT)) {
  console.log(`[prepare-models] ${NIMA_OUT} exists, skipping`);
} else {
  const uv = findUv();
  console.log('[prepare-models] converting NIMA checkpoint -> nima.onnx (via uv)');
  const r = spawnSync(uv, [
    'run', '--python', '3.12',
    '--with', 'torch', '--with', 'onnx', '--with', 'onnxscript',
    '--extra-index-url', 'https://download.pytorch.org/whl/cpu',
    'python', 'tools/convert_nima_onnx.py', '--out', NIMA_OUT,
  ], { stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// 2. mediapipe face landmarker model.
if (existsSync(LANDMARKER_OUT)) {
  console.log(`[prepare-models] ${LANDMARKER_OUT} exists, skipping`);
} else {
  console.log('[prepare-models] downloading face_landmarker.task');
  await download(LANDMARKER_URL, LANDMARKER_OUT);
}

console.log('[prepare-models] done');
