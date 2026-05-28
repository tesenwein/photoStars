import { app } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import type { EyeStatus } from '../../shared/types';

type RequestType = 'face_eye' | 'aesthetics';

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

function findScriptPath(): string {
  // In a packaged app the .py is copied next to the compiled JS.
  const prodPath = path.join(__dirname, 'analyzer.py');
  if (fs.existsSync(prodPath)) return prodPath;
  // Dev: look in the source tree.
  return path.join(app.getAppPath(), 'src', 'main', 'sidecar', 'analyzer.py');
}

function pythonBin(): string {
  return process.env.PHOTOSTARS_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
}

export class SidecarManager {
  private proc: ChildProcess | null = null;
  private pending = new Map<string, Pending>();
  private buf = '';

  start(): void {
    if (this.proc) return;

    const scriptPath = findScriptPath();
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[sidecar] analyzer.py not found at ${scriptPath}; face/eye and aesthetics disabled`);
      return;
    }

    this.proc = spawn(pythonBin(), [scriptPath], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.buf += chunk.toString();
      const lines = this.buf.split('\n');
      this.buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as SidecarResponse;
          const p = this.pending.get(msg.id);
          if (!p) continue;
          this.pending.delete(msg.id);
          if (msg.success) p.resolve(msg.result ?? {});
          else p.reject(new Error(msg.error ?? 'sidecar error'));
        } catch {}
      }
    });

    this.proc.on('exit', (code) => {
      console.warn(`[sidecar] exited with code ${String(code)}`);
      this.proc = null;
      for (const [, p] of this.pending) p.reject(new Error('sidecar process exited'));
      this.pending.clear();
    });

    this.proc.on('error', (err) => {
      console.error('[sidecar] spawn error:', err.message);
      this.proc = null;
      for (const [, p] of this.pending) p.reject(err);
      this.pending.clear();
    });
  }

  private isAlive(): boolean {
    return this.proc !== null && !this.proc.killed;
  }

  private send(type: RequestType, imagePath: string): Promise<Record<string, unknown>> {
    if (!this.isAlive()) {
      return Promise.reject(new Error('sidecar not running'));
    }
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      this.pending.set(id, { resolve, reject });
      this.proc!.stdin!.write(JSON.stringify({ id, type, image_path: imagePath }) + '\n');
    });
  }

  async analyzeFaceEye(imagePath: string): Promise<EyeStatus> {
    const r = await this.send('face_eye', imagePath);
    return {
      facesDetected: (r['facesDetected'] as number) ?? 0,
      allEyesOpen: (r['allEyesOpen'] as boolean) ?? true,
    };
  }

  async analyzeAesthetics(imagePath: string): Promise<number> {
    const r = await this.send('aesthetics', imagePath);
    return (r['aestheticsScore'] as number) ?? 5;
  }

  shutdown(): void {
    if (this.proc && !this.proc.killed) {
      this.proc.stdin?.end();
      this.proc.kill();
    }
    this.proc = null;
  }
}

export const sidecar = new SidecarManager();
