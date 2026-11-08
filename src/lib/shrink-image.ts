"use client";

/**
 * A phone photo made small enough to upload quickly on mobile data: at most
 * `max` pixels on its long side, as a JPEG. A photo the browser can't read
 * (or that's already small) is sent as it is.
 */
export async function shrinkImage(file: File, max = 1600, quality = 0.82): Promise<File> {
  if (typeof createImageBitmap === "undefined" || file.size < 400_000) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
