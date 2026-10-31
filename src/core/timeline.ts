import type { Clip, Media, Project } from './project';

export const clipDuration = (clip: Pick<Clip, 'srcStart' | 'srcEnd' | 'speed'>) => (clip.srcEnd - clip.srcStart) / clip.speed;
export const clipEnd = (clip: Clip) => clip.start + clipDuration(clip);
export const projectDuration = (project: Project) => project.main.length
  ? Math.max(...project.main.map(clipEnd))
  : Math.max(0, ...project.overlays.map(o => o.start + o.duration), ...project.audio.map(a => a.start + clipDuration(a)));
export const clipAt = (project: Project, time: number) => project.main.find(c => time >= c.start - 1e-8 && time < clipEnd(c) - 1e-8);
export const fileName = (path: string) => path.split(/[\\/]/).at(-1) ?? path;
export function formatTime(time: number, precise = false) {
  const milliseconds = Math.max(0, Math.round(time * 1000));
  const seconds = Math.floor(milliseconds / 1000);
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
  return `${h ? `${String(h).padStart(2, '0')}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${precise ? `.${String(milliseconds % 1000).padStart(3, '0')}` : ''}`;
}
export function makeClip(media: Media, start: number): Clip {
  return { id: crypto.randomUUID(), mediaId: media.id, start, srcStart: 0, srcEnd: media.duration,
    speed: 1, volume: 1, flipH: false, flipV: false, zoom: 1, stretchX: 1, stretchY: 1,
    posX: 0, posY: 0, crop: { x: 0, y: 0, w: 1, h: 1 } };
}
export function compact(clips: Clip[]) {
  let start = 0;
  for (const clip of clips) { clip.start = start; start += clipDuration(clip); }
}
export function appendMedia(project: Project, incoming: Media[]): string | null {
  let selected: string | null = null;
  for (const item of incoming) {
    let media = project.media.find(m => m.path === item.path);
    if (!media) { project.media.push(item); media = item; }
    const clip = makeClip(media, project.main.length ? Math.max(...project.main.map(clipEnd)) : 0);
    project.main.push(clip); selected = clip.id;
  }
  return selected;
}
export function splitAt(project: Project, time: number): string | null {
  const index = project.main.findIndex(c => time > c.start + 1e-6 && time < clipEnd(c) - 1e-6);
  if (index < 0) return null;
  const clip = project.main[index];
  const sourceCut = clip.srcStart + (time - clip.start) * clip.speed;
  const right: Clip = { ...clip, crop: { ...clip.crop }, id: crypto.randomUUID(), start: time, srcStart: sourceCut };
  clip.srcEnd = sourceCut;
  project.main.splice(index + 1, 0, right);
  return right.id;
}
export function deleteClip(project: Project, id: string) {
  const index = project.main.findIndex(c => c.id === id);
  if (index < 0) return;
  project.main.splice(index, 1);
  if (project.autoJoin) compact(project.main);
}
export function reorderClip(project: Project, id: string, beforeId: string | null) {
  if (id === beforeId) return;
  const index = project.main.findIndex(c => c.id === id);
  if (index < 0) return;
  if (!project.autoJoin) throw new Error('Activa la unión automática para reordenar; en modo libre puedes mover el inicio del clip.');
  const [clip] = project.main.splice(index, 1);
  const target = beforeId ? project.main.findIndex(c => c.id === beforeId) : project.main.length;
  project.main.splice(target < 0 ? project.main.length : target, 0, clip);
  compact(project.main);
}
export function trimClip(project: Project, id: string, from: number, to: number, start?: number) {
  const clip = project.main.find(c => c.id === id);
  const media = project.media.find(m => m.id === clip?.mediaId);
  if (!clip || !media) return;
  if (![from, to, start ?? clip.start].every(Number.isFinite) || from < 0 || to > media.duration + 1e-6 || to - from < 1 / project.canvas.fps || (start ?? clip.start) < 0) {
    throw new Error('El recorte debe estar dentro del original y conservar al menos un fotograma.');
  }
  const end = (start ?? clip.start) + (to - from) / clip.speed;
  if (!project.autoJoin && project.main.some(c => c.id !== id && (start ?? clip.start) < clipEnd(c) - 1e-6 && end > c.start + 1e-6)) {
    throw new Error('Ese ajuste solapa otro clip. Se conserva el valor anterior.');
  }
  clip.srcStart = from; clip.srcEnd = to;
  if (project.autoJoin) compact(project.main);
  else { clip.start = start ?? clip.start; project.main.sort((a, b) => a.start - b.start); }
}
