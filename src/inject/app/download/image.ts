import { ImageFormat } from "@/shared/settings";

const EXTENSIONS: Record<Exclude<ImageFormat, ImageFormat.ORIGINAL>, string> = {
  [ImageFormat.PNG]: "png",
  [ImageFormat.JPG]: "jpg",
  [ImageFormat.WEBP]: "webp",
};

export function extensionForFormat(format: Exclude<ImageFormat, ImageFormat.ORIGINAL>): string {
  return EXTENSIONS[format];
}

/** Content-Type of a URL from a HEAD request, or "" when unavailable. */
export async function fetchContentType(url: string): Promise<string> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.headers.get("Content-Type") ?? "";
  } catch {
    return "";
  }
}

function loadImage(blob: Blob): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode image"));
    };
    image.src = objectUrl;
  });
}

/** Re-encodes an image blob to another MIME type through a canvas. */
export async function convertImage(blob: Blob, type: string, quality = 0.95): Promise<Blob> {
  if (blob.type === type) return blob;
  const { image, objectUrl } = await loadImage(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Image conversion failed"))),
        type,
        quality,
      ),
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
