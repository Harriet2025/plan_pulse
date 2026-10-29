const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Turns a photo the user picked into a small square JPEG ready to upload: centre-cropped, shrunk, and flattened
 * onto the card colour. It also makes the upload tiny (a few KB). The server re-checks and re-encodes it regardless.
 */
export async function prepareAvatar(file, size = 256) {
  if (!ALLOWED.includes(file.type)) throw new Error('Use a JPG, PNG or WebP image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is too large. Choose one under 15 MB.');

  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('That image could not be read.'); }
  if (bitmap.width < 32 || bitmap.height < 32) { bitmap.close?.(); throw new Error('That image is too small.'); }

  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFCF9';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('That image could not be processed.'))), 'image/jpeg', 0.9));
}
