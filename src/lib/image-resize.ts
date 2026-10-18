/**
 * Shrinks a photo in the browser before upload: phone photos are often
 * over the 5 MB limit and far bigger than any screen shows. Long side
 * capped at `maxSide`, re-encoded as JPEG. Falls back to the original file
 * when the browser can't decode it (the server still checks type/size).
 * Client components only.
 */
export async function shrinkImage(
  file: File,
  maxSide = 2000,
): Promise<{ file: File; width: number | null; height: number | null }> {
  let bitmap: ImageBitmap;
  try {
    // Applies the photo's EXIF rotation, so portrait shots stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { file, width: null, height: null };
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  // Already small enough: keep the original bytes.
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
    bitmap.close();
    return { file, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { file, width: null, height: null };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return { file, width: null, height: null };
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { file: new File([blob], name, { type: "image/jpeg" }), width, height };
}
