import { filterNumber } from '../filterNumber';

export const previewVolume = (volume: number) => volume;
export const exportVolume = (volume: number): string[] => [`volume=${filterNumber(volume)}`];
