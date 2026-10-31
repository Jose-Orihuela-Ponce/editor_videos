import type { ClipSettings } from '../../core/project';
type Settings = Pick<ClipSettings, 'flipH' | 'flipV'>;
export const previewFlip = (settings: Settings): { scaleX: 1 | -1; scaleY: 1 | -1 } => ({ scaleX: settings.flipH ? -1 : 1, scaleY: settings.flipV ? -1 : 1 });
export const exportFlip = (settings: Settings): string[] => [...(settings.flipH ? ['hflip'] : []), ...(settings.flipV ? ['vflip'] : [])];
