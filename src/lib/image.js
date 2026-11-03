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

/**
 * A photo ready for the chat: scaled to at most 1600 pixels and saved again as a JPEG, which turns it the right way up and
 * drops hidden details such as where it was taken. An animated GIF is kept as it is. Returns { blob, mime, w, h }.
 */
export async function prepareChatPhoto(file, maxSide = 1600) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('That photo could not be read. Try another one.'); }
  const { width, height } = bitmap;
  if (file.type === 'image/gif') { bitmap.close?.(); return { blob: file, mime: 'image/gif', w: width, h: height }; }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFCF9';   // transparent parts become the card colour
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('That photo could not be processed.'))), 'image/jpeg', 0.85));
  return { blob, mime: 'image/jpeg', w, h };
}
