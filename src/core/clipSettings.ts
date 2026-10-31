import type { ClipSettings, Project } from './project';
import { validateGeometry } from './geometry';
import { clipDuration, clipEnd, compact } from './timeline';

/** Apply one edit atomically; a rejected speed change must not alter the clip or its neighbours. */
export function updateClipSettings(project: Project, id: string, patch: Partial<ClipSettings>): void {
  const clip = project.main.find(item => item.id === id);
  if (!clip) return;
  const media = project.media.find(item => item.id === clip.mediaId);
  if (!media) throw new Error('No se encontró el original del clip.');
  const crop = patch.crop ?? clip.crop;
  const sameCrop = crop.x === clip.crop.x && crop.y === clip.crop.y && crop.w === clip.crop.w && crop.h === clip.crop.h;
  const next = { ...clip, ...patch, crop: sameCrop ? clip.crop : { ...crop } };
  if (!Number.isFinite(next.speed) || next.speed < 0.25 || next.speed > 4) {
    throw new Error('La velocidad debe estar entre 0,25× y 4×.');
  }
  if (!Number.isFinite(next.volume) || next.volume < 0 || next.volume > 2) {
    throw new Error('El volumen debe estar entre 0% y 200%.');
  }
  if (typeof next.flipH !== 'boolean' || typeof next.flipV !== 'boolean') {
    throw new Error('El ajuste de espejo no es válido.');
  }
  validateGeometry(media, project.canvas, next);
  if (!project.autoJoin && next.speed !== clip.speed && project.main.some(other => other.id !== id
    && next.start < clipEnd(other) - 1e-6 && next.start + clipDuration(next) > other.start + 1e-6)) {
    throw new Error('Esa velocidad solapa otro clip. Se conserva el valor anterior.');
  }
  const speedChanged = next.speed !== clip.speed;
  Object.assign(clip, next);
  if (speedChanged && project.autoJoin) compact(project.main);
}
