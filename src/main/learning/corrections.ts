import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import type { CorrectionRecord } from '../../shared/ipc';

/**
 * Append-only persistence for manual-rating corrections, the raw dataset the
 * aesthetic calibration learns from. Stored as JSON Lines (one record per line)
 * in userData so it survives sessions and the preview/analysis cache clear.
 */
function correctionsFile(): string {
  return path.join(app.getPath('userData'), 'corrections.jsonl');
}

export async function appendCorrection(record: CorrectionRecord): Promise<void> {
  try {
    await fs.appendFile(correctionsFile(), JSON.stringify(record) + '\n', 'utf8');
  } catch {
    /* non-fatal: learning data is best-effort, never block the user */
  }
}

export async function readCorrections(): Promise<CorrectionRecord[]> {
  try {
    const raw = await fs.readFile(correctionsFile(), 'utf8');
    const out: CorrectionRecord[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as CorrectionRecord);
      } catch {
        /* skip a corrupt line rather than losing the whole dataset */
      }
    }
    return out;
  } catch {
    return [];
  }
}
