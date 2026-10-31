/** FFmpeg arguments use locale-independent decimals and never accept NaN. */
export function filterNumber(value: number) {
  if (!Number.isFinite(value)) throw new Error('El ajuste contiene un valor no válido.');
  return String(Math.round(value * 1e9) / 1e9);
}
