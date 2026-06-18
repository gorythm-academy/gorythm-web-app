const DEFAULT_MAX_DIMENSION = 1920;
/** Stay under common reverse-proxy limits (nginx default 1m). */
const DEFAULT_MAX_BYTES = 3.5 * 1024 * 1024;
const DEFAULT_QUALITY = 0.82;
const MIN_QUALITY = 0.55;

/** Presets for admin / portal image uploads (resize before POST). */
export const IMAGE_UPLOAD_PRESETS = {
  course: { maxDimension: 960, maxBytes: 2 * 1024 * 1024 },
  promoThumbnail: { maxDimension: 1280, maxBytes: 2.5 * 1024 * 1024 },
  research: { maxDimension: 1920, maxBytes: 3.5 * 1024 * 1024 },
  lms: { maxDimension: 1600, maxBytes: 3 * 1024 * 1024 },
  paymentProof: { maxDimension: 1400, maxBytes: 950 * 1024 },
};

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not compress image'))),
      type,
      quality
    );
  });
}

function baseNameFromFile(file) {
  const name = String(file?.name || 'image').trim();
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name || 'image';
}

/**
 * Resize and convert to WebP so uploads stay under proxy body limits.
 * Returns the original file when compression is unavailable or unnecessary.
 * @param {File} file
 * @param {{ maxDimension?: number, maxBytes?: number }} [options]
 */
export async function compressImageForUpload(file, options = {}) {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  if (!file || typeof window === 'undefined') return file;
  if (!String(file.type || '').startsWith('image/')) return file;
  if (file.type === 'image/gif') return file;

  const isModernSmall =
    file.size <= maxBytes && (file.type === 'image/webp' || file.type === 'image/avif');
  const isJpegOrPng = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/jpg';
  const needsResize = file.size > maxBytes || isJpegOrPng;

  if (isModernSmall && !needsResize) {
    return file;
  }

  if (typeof createImageBitmap !== 'function') return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    let targetW = bitmap.width;
    let targetH = bitmap.height;
    const longest = Math.max(targetW, targetH);
    if (longest > maxDimension) {
      const scale = maxDimension / longest;
      targetW = Math.max(1, Math.round(targetW * scale));
      targetH = Math.max(1, Math.round(targetH * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    let quality = DEFAULT_QUALITY;
    let blob = await canvasToBlob(canvas, 'image/webp', quality);
    while (blob.size > maxBytes && quality > MIN_QUALITY) {
      quality -= 0.07;
      blob = await canvasToBlob(canvas, 'image/webp', quality);
    }

    if (blob.size >= file.size && file.size <= maxBytes && !isJpegOrPng) {
      return file;
    }

    return new File([blob], `${baseNameFromFile(file)}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}
