import { createEmptyProject } from './project';
import type { Media, Orientation } from './project';
import { applyStyle } from './presets';
import type { Preset } from './presets';
import { makeClip } from './timeline';

export type DownloadQuality = '1080' | '720';
export interface DownloadResult { cancelled: boolean; media: Media | null; title: string; folder: string }
export interface AutomaticProgress { jobId: string; percent: number; stage: string }

export function automaticProject(media: Media, orientation: Orientation, preset: Preset, title: string) {
  if (!preset.clip) throw new Error(`Guarda primero un estilo ${orientation} desde el editor manual.`);
  if (media.kind !== 'video' || !Number.isFinite(media.duration) || media.duration <= 0) throw new Error('La descarga no contiene un video válido.');
  const project = createEmptyProject(title || 'Video de YouTube', orientation);
  project.media = [structuredClone(media)];
  project.main = [makeClip(project.media[0], 0)];
  applyStyle(project, project.main[0].id, structuredClone(preset));
  return project;
}

export function automaticName(title: string) {
  const clean = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  const encoder = new TextEncoder();
  let name = '';
  for (const character of clean) {
    if (encoder.encode(name + character).length > 160) break;
    name += character;
  }
  name = name.replace(/[. ]+$/, '');
  // Prefix also avoids reserved Windows basenames (CON, AUX, etc.).
  return `Editado - ${name || 'Video de YouTube'}`;
}
