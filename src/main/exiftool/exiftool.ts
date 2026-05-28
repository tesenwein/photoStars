import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function runExiftool(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const binary = process.env.EXIFTOOL_PATH ?? 'exiftool';

  try {
    const { stdout, stderr } = await execFileAsync(binary, args);
    return { stdout, stderr };
  } catch (error) {
    throw new Error(`exiftool failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
