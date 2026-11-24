export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Safe file name: letters, digits, dash. */
export const fileSlug = (s: string): string =>
  s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'crane';

/** Rasterise the standalone SVG sheet (A3 landscape) at the given pixel width. */
export async function svgToPngBlob(svg: string, widthPx = 2480): Promise<Blob> {
  const heightPx = Math.round((widthPx * 297) / 420);
  const sized = svg.replace(/width="420mm" height="297mm"/, `width="${widthPx}" height="${heightPx}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The drawing could not be rasterised.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0, widthPx, heightPx);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
