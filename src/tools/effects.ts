import type { ClipSettings } from '../core/project';
import { previewFlip } from './flip/effects';
import { previewSpeed } from './speed/effects';
import { previewTransform } from './transform/effects';
import { previewVolume } from './volume/effects';

export const getPlaybackSettings = (settings: Pick<ClipSettings, 'speed' | 'volume'>) => ({ speed: previewSpeed(settings.speed), volume: previewVolume(settings.volume) });
export const getVisualSettings = (media: { w?: number; h?: number }, canvas: { w: number; h: number }, settings: ClipSettings) => ({ geometry: previewTransform(media, canvas, settings), flip: previewFlip(settings) });
