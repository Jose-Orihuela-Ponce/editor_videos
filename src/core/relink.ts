import type { Media, Project } from './project';
import { validateGeometry } from './geometry';

/** Keep timeline IDs and edits; reject a replacement that cannot cover the used source ranges. */
export function relinkMedia(project: Project, id: string, replacement: Media) {
  const original = project.media.find(m => m.id === id);
  if (!original) throw new Error('El archivo ya no está en el proyecto.');
  if (replacement.kind !== original.kind) throw new Error('El archivo elegido debe ser del mismo tipo.');
  const clips = project.main.filter(c => c.mediaId === id);
  const videos = project.overlays.filter(o => o.type === 'video' && o.mediaId === id);
  const audio = project.audio.filter(a => a.mediaId === id);
  const required = Math.max(0, ...clips.map(c => c.srcEnd), ...videos.map(v => v.srcEnd ?? 0), ...audio.map(a => a.srcEnd));
  if (replacement.duration + 1e-6 < required) throw new Error('El archivo elegido es demasiado corto para los cortes usados en el proyecto.');
  if ((audio.length || (original.hasAudio && (clips.length || videos.length))) && !replacement.hasAudio) throw new Error('El archivo elegido no contiene el audio que usa el proyecto.');
  for (const clip of clips) validateGeometry(replacement, project.canvas, clip);
  Object.assign(original, { ...replacement, id: original.id, relPath: undefined });
}
