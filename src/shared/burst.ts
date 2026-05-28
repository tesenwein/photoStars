export interface BurstItem {
  path: string;
  /** Capture time in Unix ms, or a negative value when unknown. */
  ts: number;
}

export interface BurstInfo {
  burstGroup: string;
  burstRank: number;
}

/**
 * Groups shots whose capture times fall in the same fixed window into bursts.
 * Pure (no I/O) so both the main process and the renderer can call it — the
 * renderer re-buckets live when the burst-window slider changes. Only groups
 * with ≥2 members are emitted; rank is assigned by path order for stability.
 */
export function bucketBursts(items: BurstItem[], windowMs: number): Map<string, BurstInfo> {
  const result = new Map<string, BurstInfo>();
  if (windowMs <= 0) return result;

  const buckets = new Map<number, string[]>();
  for (const { path, ts } of items) {
    if (ts < 0) continue;
    const bucket = Math.floor(ts / windowMs) * windowMs;
    const list = buckets.get(bucket);
    if (list) list.push(path);
    else buckets.set(bucket, [path]);
  }

  for (const [bucket, paths] of buckets) {
    if (paths.length < 2) continue;
    paths.sort((a, b) => a.localeCompare(b));
    const group = `b${bucket}`;
    paths.forEach((p, i) => result.set(p, { burstGroup: group, burstRank: i + 1 }));
  }

  return result;
}
