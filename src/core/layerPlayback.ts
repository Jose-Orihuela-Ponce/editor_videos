import type { Project } from './project';
import { clipDuration } from './timeline';
import { isActive } from './layers';
import { mediaUrl } from './mediaUrl';
import { previewAudio } from './previewAudio';
import { ensureProxy, previewPath } from './proxies';

interface Entry { element: HTMLMediaElement; route: ReturnType<typeof previewAudio>; source: string; active: boolean }
interface TimedSource { id: string; mediaId: string; start: number; duration: number; srcStart: number; speed: number; volume: number }
function sources(project: Project): TimedSource[] {
  return [
    ...project.overlays.filter(o => o.type === 'video' && o.mediaId).map(o => ({ id: o.id, mediaId: o.mediaId!, start: o.start, duration: o.duration, srcStart: o.srcStart ?? 0, speed: o.speed ?? 1, volume: o.volume ?? 1 })),
    ...project.audio.map(a => ({ id: a.id, mediaId: a.mediaId, start: a.start, duration: clipDuration(a), srcStart: a.srcStart, speed: a.speed, volume: a.volume })),
  ];
}
export function layerTiming(project: Project | null | undefined) {
  return project ? JSON.stringify(sources(project).map(s => [s.id, s.mediaId, s.start, s.duration, s.srcStart, s.speed])) : '';
}
export class LayerPlayback {
  private entries = new Map<string, Entry>();
  private pending = false;
  private disposed = false;
  constructor(private changed: () => void) {}
  register(id: string, element: HTMLMediaElement) {
    if (this.disposed) return () => {};
    const entry: Entry = { element, route: previewAudio(element), source: '', active: false };
    element.preload = 'auto'; element.hidden = true; entry.route.setVolume(0);
    this.entries.set(id, entry); this.schedule();
    return () => {
      element.pause(); entry.route.setVolume(0); element.removeAttribute('src'); element.load();
      if (this.entries.get(id) === entry) { this.entries.delete(id); this.schedule(); }
    };
  }
  private schedule() {
    if (this.pending || this.disposed) return;
    this.pending = true; queueMicrotask(() => { this.pending = false; if (!this.disposed) this.changed(); });
  }
  hasActive(project: Project, time: number) { return sources(project).some(s => isActive(s.start, s.duration, time)); }
  needsPrepare(project: Project, time: number) {
    const active = new Set(sources(project).filter(s => isActive(s.start, s.duration, time)).map(s => s.id));
    return [...this.entries].some(([id, entry]) => entry.active !== active.has(id));
  }
  updateGains(project: Project) {
    for (const source of sources(project)) { const entry = this.entries.get(source.id); if (entry?.active) entry.route.setVolume(source.volume); }
  }
  private waitFor(element: HTMLMediaElement, name: 'loadedmetadata' | 'seeked', signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const clean = () => { clearTimeout(timer); element.removeEventListener(name, done); element.removeEventListener('error', fail); signal.removeEventListener('abort', abort); };
      const done = () => { clean(); resolve(); };
      const fail = () => { clean(); reject(new Error('No se puede reproducir una capa. Comprueba el archivo original.')); };
      const abort = () => { clean(); reject(new DOMException('Búsqueda sustituida', 'AbortError')); };
      const timer = setTimeout(() => { clean(); reject(new Error('Una capa no respondió a tiempo.')); }, 12000);
      element.addEventListener(name, done, { once: true }); element.addEventListener('error', fail, { once: true }); signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  async prepare(project: Project, time: number, signal: AbortSignal) {
    const active = new Map(sources(project).filter(s => isActive(s.start, s.duration, time)).map(s => [s.id, s]));
    await Promise.all([...this.entries].map(async ([id, entry]) => {
      const spec = active.get(id), element = entry.element;
      element.pause(); entry.active = false; element.hidden = true; entry.route.setVolume(0);
      if (!spec) return;
      const media = project.media.find(m => m.id === spec.mediaId);
      if (!media) throw new Error('No se encontró un original de una capa.');
      let path = previewPath(media);
      if (entry.source !== path || element.error) { entry.source = path; element.src = mediaUrl(path); element.load(); }
      try { if (element.readyState < 1) await this.waitFor(element, 'loadedmetadata', signal); }
      catch (error) {
        if (signal.aborted || media.kind !== 'video' || path !== media.path) throw error;
        const fallback = await ensureProxy(media); if (!fallback || signal.aborted) throw error;
        path = fallback; entry.source = path; element.src = mediaUrl(path); element.load();
        if (element.readyState < 1) await this.waitFor(element, 'loadedmetadata', signal);
      }
      if (signal.aborted) return;
      const sourceTime = spec.srcStart + Math.max(0, time - spec.start) * spec.speed;
      element.playbackRate = spec.speed; element.preservesPitch = true;
      if (Math.abs(element.currentTime - sourceTime) > 0.001 || element.seeking) {
        element.currentTime = sourceTime;
        if (element.seeking) await this.waitFor(element, 'seeked', signal);
      }
      if (signal.aborted) return;
      entry.route.setVolume(spec.volume); entry.active = true; element.hidden = false;
    }));
  }
  async play(valid: () => boolean) {
    await Promise.all([...this.entries.values()].filter(e => e.active).map(async entry => {
      await entry.route.resume(); if (!valid()) return;
      await entry.element.play(); if (!valid()) entry.element.pause();
    }));
  }
  correct(project: Project, time: number) {
    for (const spec of sources(project)) {
      const entry = this.entries.get(spec.id); if (!entry?.active || !isActive(spec.start, spec.duration, time)) continue;
      const expected = spec.srcStart + (time - spec.start) * spec.speed;
      if (!entry.element.seeking && Math.abs(entry.element.currentTime - expected) > 0.12 * spec.speed) entry.element.currentTime = expected;
    }
  }
  pause() { for (const entry of this.entries.values()) entry.element.pause(); }
  dispose() { this.disposed = true; this.pause(); for (const entry of this.entries.values()) entry.route.setVolume(0); this.entries.clear(); }
}
