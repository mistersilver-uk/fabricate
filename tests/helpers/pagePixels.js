/** The `[r, g, b]` Chromium paints at the viewport pixel `x`, `y` of `page`. */
export async function pixelAt(page, x, y) {
  const shot = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return page.evaluate(
    async (bytes) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' })
      );
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    },
    [...shot]
  );
}
