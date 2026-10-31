import { filterNumber } from '../filterNumber';

export function previewSpeed(speed: number) {
  if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) throw new Error('La velocidad del clip debe estar entre 0,25× y 4×.');
  return speed;
}
export const exportSpeedVideo = (speed: number): string[] => [`setpts=(PTS-STARTPTS)/${filterNumber(previewSpeed(speed))}`];
export function exportSpeed(speed: number): string[] {
  previewSpeed(speed);
  const factors: number[] = [];
  while (speed > 2) { factors.push(2); speed /= 2; }
  while (speed < 0.5) { factors.push(0.5); speed /= 0.5; }
  factors.push(speed);
  return factors.map(value => `atempo=${filterNumber(value)}`);
}
