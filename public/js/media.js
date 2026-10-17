/** Photo capture in the browser. Photos are shrunk before upload to save data and time. */

const MAX_IMAGE_SIDE = 1280;
const JPEG_QUALITY = 0.82;

/** Read a Blob as base64 without the data: prefix. */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function decodeImage(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> path, which supports more formats in some browsers.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shrink a photo to at most 1280 px on its long side and encode it as JPEG. */
export async function shrinkImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("not an image");
  const image = await decodeImage(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  return { mimeType: "image/jpeg", data: await blobToBase64(blob), previewUrl: URL.createObjectURL(blob) };
}
