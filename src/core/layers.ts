import type { AudioClip, Media, Overlay, Project, TextStyle } from './project';
import { clipDuration } from './timeline';

export const defaultTextStyle = (): TextStyle => ({ font: 'Montserrat', size: 80, color: '#ffffff', bgColor: '#000000', bgOpacity: 0.5, bgEnabled: true, bold: false, italic: false, underline: false, opacity: 1, align: 'center' });
export const overlayEnd = (item: Overlay) => item.start + item.duration;
export const audioEnd = (item: AudioClip) => item.start + clipDuration(item);
export const isActive = (start: number, duration: number, time: number) => time >= start - 1e-8 && time < start + duration - 1e-8;
export function timelineExtent(project: Project) {
  return Math.max(0, ...project.main.map(c => c.start + clipDuration(c)), ...project.overlays.map(overlayEnd), ...project.audio.map(audioEnd));
}
type Timed = { id: string; start: number; track?: number };
function availableTrack<T extends Timed>(items: T[], start: number, end: number, endOf: (item: T) => number, exclude?: string) {
  for (let track = 0; ; track++) {
    if (!items.some(item => item.id !== exclude && (item.track ?? 0) === track && start < endOf(item) - 1e-6 && end > item.start + 1e-6)) return track;
  }
}
export function addMedia(project: Project, incoming: Media): Media {
  let media = project.media.find(item => item.path === incoming.path);
  if (!media) { project.media.push(incoming); media = incoming; }
  return media;
}
export function addVisualLayer(project: Project, start: number, media?: Media): string {
  if (!Number.isFinite(start) || start < 0) throw new Error('La posición no es válida.');
  if (media && media.kind !== 'video' && media.kind !== 'image') throw new Error('Este archivo no es una imagen ni un video.');
  const item: Overlay = media
    ? media.kind === 'video'
      ? { id: crypto.randomUUID(), type: 'video', mediaId: addMedia(project, media).id, start, duration: media.duration, srcStart: 0, srcEnd: media.duration, speed: 1, volume: 1, posX: 0, posY: 0, scale: 0.5 }
      : { id: crypto.randomUUID(), type: 'image', mediaId: addMedia(project, media).id, start, duration: 5, posX: 0, posY: 0, scale: 0.5 }
    : { id: crypto.randomUUID(), type: 'text', text: 'Texto', style: defaultTextStyle(), start, duration: 5, posX: 0, posY: 0, scale: 1 };
  item.track = availableTrack(project.overlays, start, overlayEnd(item), overlayEnd);
  project.overlays.push(item); return item.id;
}
export function addAudioLayer(project: Project, start: number, media: Media): string {
  if (!Number.isFinite(start) || start < 0 || (media.kind !== 'audio' && !(media.kind === 'video' && media.hasAudio)) || media.duration <= 0) throw new Error('El audio o su posición no son válidos.');
  const item: AudioClip = { id: crypto.randomUUID(), mediaId: addMedia(project, media).id, start, srcStart: 0, srcEnd: media.duration, speed: 1, volume: 1 };
  item.track = availableTrack(project.audio, start, audioEnd(item), audioEnd);
  project.audio.push(item); return item.id;
}
export function removeLayer(project: Project, id: string) {
  project.overlays = project.overlays.filter(item => item.id !== id);
  project.audio = project.audio.filter(item => item.id !== id);
}
export function moveLayer(project: Project, id: string, start: number, track?: number) {
  if (!Number.isFinite(start) || start < 0 || (track !== undefined && (!Number.isInteger(track) || track < 0 || track > 1000))) throw new Error('La posición de la capa no es válida.');
  const overlay = project.overlays.find(item => item.id === id);
  if (overlay) {
    const requested = track ?? overlay.track ?? 0;
    const overlaps = project.overlays.some(item => item.id !== id && (item.track ?? 0) === requested && start < overlayEnd(item) - 1e-6 && start + overlay.duration > item.start + 1e-6);
    overlay.track = overlaps ? availableTrack(project.overlays, start, start + overlay.duration, overlayEnd, id) : requested;
    overlay.start = start; return;
  }
  const audio = project.audio.find(item => item.id === id);
  if (audio) {
    const requested = track ?? audio.track ?? 0, end = start + clipDuration(audio);
    const overlaps = project.audio.some(item => item.id !== id && (item.track ?? 0) === requested && start < audioEnd(item) - 1e-6 && end > item.start + 1e-6);
    audio.track = overlaps ? availableTrack(project.audio, start, end, audioEnd, id) : requested;
    audio.start = start;
  }
}
export function updateOverlay(project: Project, id: string, patch: Partial<Overlay>) {
  const item = project.overlays.find(layer => layer.id === id); if (!item) return;
  const next = { ...item, ...patch, style: patch.style ? { ...patch.style } : item.style };
  if (next.type === 'video') next.duration = ((next.srcEnd ?? 0) - (next.srcStart ?? 0)) / (next.speed ?? 1);
  if (![next.start, next.duration, next.posX, next.posY, next.scale].every(Number.isFinite) || next.start < 0 || next.duration < 1 / project.canvas.fps || next.scale < 0.1 || next.scale > 10 || Math.abs(next.posX) > project.canvas.w * 2 || Math.abs(next.posY) > project.canvas.h * 2) throw new Error('El tiempo, la escala o la posición de la capa no son válidos.');
  const media = project.media.find(source => source.id === next.mediaId);
  if (next.type === 'video' && (!media || media.kind !== 'video' || ![next.srcStart, next.srcEnd, next.speed, next.volume].every(v => typeof v === 'number' && Number.isFinite(v)) || next.srcStart! < 0 || next.srcEnd! > media.duration + 1e-6 || next.srcEnd! <= next.srcStart! || next.speed! < 0.25 || next.speed! > 4 || next.volume! < 0 || next.volume! > 2)) throw new Error('Los ajustes del video superpuesto no son válidos.');
  if (next.type === 'image' && media?.kind !== 'image') throw new Error('No se encontró la imagen original.');
  if (next.type === 'text' && (!next.style || typeof next.text !== 'string' || next.text.length > 5000 || !Number.isFinite(next.style.size) || next.style.size < 8 || next.style.size > 500 || !/^#[0-9a-f]{6}$/i.test(next.style.color) || (next.style.bgColor && !/^#[0-9a-f]{6}$/i.test(next.style.bgColor)) || (next.style.bgOpacity !== undefined && (!Number.isFinite(next.style.bgOpacity) || next.style.bgOpacity < 0 || next.style.bgOpacity > 1)) || (next.style.opacity !== undefined && (!Number.isFinite(next.style.opacity) || next.style.opacity < 0 || next.style.opacity > 1)))) throw new Error('El estilo o contenido del texto no es válido.');
  Object.assign(item, next);
}
export function updateAudio(project: Project, id: string, patch: Partial<AudioClip>) {
  const item = project.audio.find(layer => layer.id === id); if (!item) return;
  const next = { ...item, ...patch }, media = project.media.find(source => source.id === next.mediaId);
  if (!media?.hasAudio || ![next.start, next.srcStart, next.srcEnd, next.speed, next.volume].every(Number.isFinite) || next.start < 0 || next.srcStart < 0 || next.srcEnd > media.duration + 1e-6 || next.srcEnd <= next.srcStart || next.speed < 0.25 || next.speed > 4 || next.volume < 0 || next.volume > 2 || clipDuration(next) < 1 / project.canvas.fps) throw new Error('Los ajustes del audio no son válidos.');
  Object.assign(item, next);
}
export function splitLayer(project: Project, id: string, time: number): string | null {
  const visual = project.overlays.find(item => item.id === id);
  if (visual && time > visual.start + 1e-6 && time < overlayEnd(visual) - 1e-6) {
    const right: Overlay = { ...visual, style: visual.style ? { ...visual.style } : undefined, id: crypto.randomUUID(), start: time, duration: overlayEnd(visual) - time };
    if (visual.type === 'video') { const cut = visual.srcStart! + (time - visual.start) * visual.speed!; right.srcStart = cut; visual.srcEnd = cut; }
    visual.duration = time - visual.start; project.overlays.splice(project.overlays.indexOf(visual) + 1, 0, right); return right.id;
  }
  const audio = project.audio.find(item => item.id === id);
  if (audio && time > audio.start + 1e-6 && time < audioEnd(audio) - 1e-6) {
    const cut = audio.srcStart + (time - audio.start) * audio.speed;
    const right = { ...audio, id: crypto.randomUUID(), start: time, srcStart: cut }; audio.srcEnd = cut;
    project.audio.splice(project.audio.indexOf(audio) + 1, 0, right); return right.id;
  }
  return null;
}
