// Client-side image compression for evidence uploads.
//
// Inspection photos shot on a modern phone are 4–8 MB each. Stored raw they
// burn storage quota, slow modal previews, inflate PDF exports and (since
// the AI analysis sends the bytes as base64) inflate Gemini token bills.
//
// We resize to a max edge of 1600 px and recompress as JPEG at 0.82 quality.
// That's well above what NORSOK-style inspection records need (a 1600 px
// long-edge frame is sharp enough for crops/zooming when reviewing), and
// typically cuts file size by 10×.
//
// Pure browser: <canvas> only, no dependency.

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;
// Don't bother compressing already-small images.
const SKIP_BELOW_BYTES = 500 * 1024;

export interface CompressResult {
  file: File;
  compressed: boolean;
  originalBytes: number;
  finalBytes: number;
}

/** Returns the (possibly recompressed) file plus stats. PDFs pass through. */
export async function compressImage(file: File): Promise<CompressResult> {
  const originalBytes = file.size;
  if (!file.type.startsWith("image/")) {
    return { file, compressed: false, originalBytes, finalBytes: originalBytes };
  }
  if (file.size <= SKIP_BELOW_BYTES) {
    return { file, compressed: false, originalBytes, finalBytes: originalBytes };
  }

  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = scaledSize(bitmap.width, bitmap.height, MAX_EDGE);
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement("canvas"), { width, height });
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) {
      return { file, compressed: false, originalBytes, finalBytes: originalBytes };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
    if (!blob || blob.size >= originalBytes * 0.95) {
      // Compression didn't help (already efficient JPEG, or canvas blew it
      // up) — keep the original to avoid wasting cycles.
      return { file, compressed: false, originalBytes, finalBytes: originalBytes };
    }

    const newName = file.name.replace(/\.\w+$/, "") + ".jpg";
    const compressedFile = new File([blob], newName, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
    return {
      file: compressedFile,
      compressed: true,
      originalBytes,
      finalBytes: compressedFile.size,
    };
  } catch {
    return { file, compressed: false, originalBytes, finalBytes: originalBytes };
  }
}

function scaledSize(w: number, h: number, maxEdge: number) {
  if (w <= maxEdge && h <= maxEdge) return { width: w, height: h };
  if (w >= h) {
    return { width: maxEdge, height: Math.round((h * maxEdge) / w) };
  }
  return { width: Math.round((w * maxEdge) / h), height: maxEdge };
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  // createImageBitmap honours EXIF orientation in current Safari / Chrome,
  // and skips the synchronous decode <img> tags do.
  return await createImageBitmap(file, { imageOrientation: "from-image" });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number
): Promise<Blob | null> {
  if ("convertToBlob" in canvas) {
    return await canvas.convertToBlob({ type, quality });
  }
  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), type, quality)
  );
}
