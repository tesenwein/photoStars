import sharp from 'sharp';

/**
 * Returns the fraction of pixels (0–1) that fall in the human skin-tone
 * colour range.  Works in both bright and dark/moody lighting because we
 * test the hue and the R>G>B relationship rather than requiring high
 * brightness.
 *
 * Skin hue in HSV: roughly 0–25° (red-orange).
 * We approximate this in RGB:  R is dominant,  R-G is significant,  B is low.
 */
export async function skinFraction(imagePath: string): Promise<number> {
  try {
    const { data, info } = await sharp(imagePath)
      .resize(120, 120, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const total = info.width * info.height;
    let skinPx  = 0;

    for (let i = 0; i < data.length; i += 3) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;

      // Must be warm (R dominant) but not saturated red/orange only
      if (
        r > 50          &&   // not pitch black
        r > g           &&   // red dominant
        r - g > 10      &&   // meaningful warm shift
        g >= b          &&   // green ≥ blue (no cool cast)
        r - b > 20      &&   // warm vs blue
        r < 250              // not blown out
      ) {
        skinPx++;
      }
    }

    return skinPx / total;
  } catch {
    return 0;
  }
}

/** True when the image likely contains a human subject (portrait / fashion). */
export async function isPortraitSubject(
  imagePath: string,
  facesDetected: number
): Promise<boolean> {
  if (facesDetected > 0) return true;
  const frac = await skinFraction(imagePath);
  return frac > 0.04; // >4 % skin tones → likely a portrait even without face detection
}
