/** Distances are measured on screen so the magnet feels the same at every preview size. */
export function snapToCenter(position: number, canvasSize: number, previewSize: number, latched: boolean, bypass = false) {
  const distance = Math.abs(position) * previewSize / canvasSize;
  const snapped = !bypass && distance <= (latched ? 12 : 6);
  return { position: snapped ? 0 : Math.round(position), snapped };
}
