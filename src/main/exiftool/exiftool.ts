import { ExifTool } from 'exiftool-vendored';

// Single shared ExifTool process pool. Call end() on app quit.
export const exiftoolInstance = new ExifTool({ taskTimeoutMillis: 15_000 });
