import { clipAt, clipEnd, fileName, projectDuration } from './timeline';
import { useProjectStore } from './store';
import { useSession } from './session';
import type { Clip, Project } from './project';
import { previewAudio } from './previewAudio';
import { getPlaybackSettings } from '../tools/effects';
import { LayerPlayback, layerTiming } from './layerPlayback';
import { mediaUrl } from './mediaUrl';
import { ensureProxy, previewPath, useProxies } from './proxies';

export { mediaUrl } from './mediaUrl';
const frameListeners = new Set<(time: number) => void>();
export const onPlaybackFrame = (listener: (time: number) => void) => { frameListeners.add(listener); return () => { frameListeners.delete(listener); }; };

export class PlaybackController {
  private token = 0;
  private abort = new AbortController();
  private raf = 0;
  private wanted = false;
  private active: Clip | undefined;
  private source = '';
  private gapAnchor = 0;
  private gapTime = 0;
  private lastPublish = 0;
  private unsubscribe: () => void;
  private disposed = false;
  private unsubscribeProxy: () => void;
  private audio: ReturnType<typeof previewAudio>;
  private layers: LayerPlayback;
  time = 0;

  constructor(private video: HTMLVideoElement) {
    this.audio = previewAudio(video);
    this.layers = new LayerPlayback(() => { if (!this.disposed) void this.seek(this.time, this.wanted); });
    this.unsubscribeProxy = useProxies.subscribe((state, previous) => {
      if (state.paths === previous.paths || this.disposed) return;
      const p = this.project(), media = p?.media.find(m => m.id === this.active?.mediaId);
      const layerReady = p?.overlays.some(o => o.type === 'video' && o.mediaId && o.start <= this.time && this.time < o.start + o.duration && p.media.some(m => m.id === o.mediaId && state.paths[m.path] && state.paths[m.path] !== previous.paths[m.path]));
      if ((media && state.paths[media.path] && state.paths[media.path] !== previous.paths[media.path]) || layerReady) void this.seek(this.time, this.wanted);
    });
    video.preload = 'auto';
    video.addEventListener('ended', this.ended);
    video.addEventListener('waiting', this.waiting);
    video.addEventListener('playing', this.ready);
    this.unsubscribe = useProjectStore.subscribe((state, previous) => {
      if (state.project?.id !== previous.project?.id || state.project?.main !== previous.project?.main || state.project?.media !== previous.project?.media || state.project?.overlays !== previous.project?.overlays || state.project?.audio !== previous.project?.audio) {
        const p = state.project;
        const next = p && clipAt(p, Math.min(this.time, Math.max(0, projectDuration(p) - 1 / p.canvas.fps)));
        // Image and gain edits do not reload or interrupt the current frame.
        const sameLayers = layerTiming(p) === layerTiming(previous.project);
        if (p && p.id === previous.project?.id && state.project?.media === previous.project?.media && sameLayers && state.project?.main === previous.project?.main) {
          this.layers.updateGains(p); return;
        }
        if (p?.id === previous.project?.id && state.project?.media === previous.project?.media && sameLayers && this.active && next &&
            next.id === this.active.id && next.mediaId === this.active.mediaId && next.start === this.active.start &&
            next.srcStart === this.active.srcStart && next.srcEnd === this.active.srcEnd && next.speed === this.active.speed) {
          this.active = next; this.audio.setVolume(getPlaybackSettings(next).volume); this.layers.updateGains(p); return;
        }
        this.pause(); void this.seek(Math.min(this.time, state.project ? projectDuration(state.project) : 0), false);
      }
    });
    useSession.setState({ time: 0, playing: false, loading: false, error: '', selectedId: null });
    void this.seek(0, false);
  }
  private project(): Project | null { return useProjectStore.getState().project; }
  registerLayer(id: string, element: HTMLMediaElement) { return this.layers.register(id, element); }
  private publish(time: number, force = false) {
    this.time = time;
    frameListeners.forEach(listener => listener(time));
    if (force || performance.now() - this.lastPublish >= 80) {
      this.lastPublish = performance.now(); useSession.setState({ time });
    }
  }
  private waitFor(eventName: 'loadedmetadata' | 'seeked', signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.video.removeEventListener(eventName, done); this.video.removeEventListener('error', fail); signal.removeEventListener('abort', aborted); };
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error('No se puede reproducir este formato. Prueba un MP4 con video H.264 y audio AAC.')); };
      const aborted = () => { cleanup(); reject(new DOMException('Búsqueda sustituida', 'AbortError')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('El video no respondió a tiempo. Comprueba que el original siga disponible.')); }, 12000);
      this.video.addEventListener(eventName, done, { once: true });
      this.video.addEventListener('error', fail, { once: true });
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
    });
  }
  async seek(requested: number, resume = this.wanted) {
    if (this.disposed) return;
    const project = this.project(); if (!project) return;
    const token = ++this.token; this.abort.abort(); this.abort = new AbortController();
    const signal = this.abort.signal;
    cancelAnimationFrame(this.raf); this.video.pause(); this.layers.pause(); this.wanted = resume;
    const duration = projectDuration(project), time = Math.max(0, Math.min(duration, requested));
    this.publish(time, true);
    const viewTime = time >= duration && duration > 0 ? Math.max(0, duration - 1 / project.canvas.fps) : time;
    const clip = clipAt(project, viewTime); this.active = clip;
    useSession.setState({ playing: resume, loading: !!clip || this.layers.hasActive(project, viewTime), error: '' });
    if (!clip) {
      this.audio.setVolume(0);
      this.video.hidden = true;
      try {
        await this.layers.prepare(project, viewTime, signal);
        if (token !== this.token || this.disposed) return;
        useSession.setState({ loading: false });
        if (this.wanted && time < duration) {
          await this.layers.play(() => token === this.token && !this.disposed && this.wanted);
          if (token !== this.token || this.disposed || !this.wanted) return;
          this.gapAnchor = performance.now(); this.gapTime = time; this.raf = requestAnimationFrame(this.tick);
        } else this.pause();
      } catch (error) { if (!signal.aborted && token === this.token && !this.disposed) { this.pause(); useSession.setState({ loading: false, error: error instanceof Error ? error.message : String(error) }); } }
      return;
    }
    const media = project.media.find(m => m.id === clip.mediaId);
    if (!media) { this.pause(); useSession.setState({ loading: false, error: 'No se encontró el original de este clip.' }); return; }
    try {
      this.video.hidden = true;
      const path = previewPath(media);
      if (this.source !== path || this.video.error) {
        this.source = path;
        this.video.src = mediaUrl(path);
        this.video.load();
        if (this.video.readyState < 1) await this.waitFor('loadedmetadata', signal);
      } else if (this.video.readyState < 1) await this.waitFor('loadedmetadata', signal);
      if (token !== this.token || this.disposed) return;
      const sourceTime = Math.max(clip.srcStart, Math.min(clip.srcEnd - 1e-6, clip.srcStart + (viewTime - clip.start) * clip.speed));
      const sound = getPlaybackSettings(clip);
      this.video.playbackRate = sound.speed; this.video.preservesPitch = true; this.audio.setVolume(sound.volume);
      if (Math.abs(this.video.currentTime - sourceTime) > 0.001 || this.video.seeking) {
        this.video.currentTime = sourceTime;
        if (this.video.seeking) await this.waitFor('seeked', signal);
      }
      if (token !== this.token || this.disposed) return;
      await this.layers.prepare(project, viewTime, signal);
      if (token !== this.token || this.disposed) return;
      this.video.hidden = false;
      useSession.setState({ loading: false });
      if (this.wanted && time < duration) {
        await this.audio.resume();
        if (token !== this.token || this.disposed || !this.wanted) return;
        await Promise.all([this.video.play(), this.layers.play(() => token === this.token && !this.disposed && this.wanted)]);
        if (token !== this.token || this.disposed || !this.wanted) return;
        this.raf = requestAnimationFrame(this.tick);
      } else this.pause();
    } catch (error) {
      if (signal.aborted || token !== this.token || this.disposed) return;
      if (previewPath(media) === media.path && media.kind === 'video') { const fallback = await ensureProxy(media); if (signal.aborted || token !== this.token || this.disposed) return; if (fallback) { void this.seek(time, resume); return; } }
      this.pause(); useSession.setState({ loading: false, error: `${fileName(media.path)}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  private tick = () => {
    if (!this.wanted || this.disposed) return;
    const project = this.project(); if (!project) return;
    const duration = projectDuration(project);
    let time: number;
    if (this.active) {
      time = this.active.start + (this.video.currentTime - this.active.srcStart) / this.active.speed;
      if (time >= clipEnd(this.active) - 0.0005 || this.video.ended) { void this.seek(clipEnd(this.active), true); return; }
    } else {
      time = this.gapTime + (performance.now() - this.gapAnchor) / 1000;
      const next = project.main.find(c => c.start > this.gapTime - 1e-6);
      if (next && time >= next.start) { void this.seek(next.start, true); return; }
    }
    if (time >= duration) { this.publish(duration, true); this.pause(); return; }
    if (this.layers.needsPrepare(project, time)) { void this.seek(time, true); return; }
    this.layers.correct(project, time);
    this.publish(Math.max(0, time)); this.raf = requestAnimationFrame(this.tick);
  };
  private ended = () => { if (this.wanted && this.active) void this.seek(clipEnd(this.active), true); };
  private waiting = () => { if (this.wanted) useSession.setState({ loading: true }); };
  private ready = () => { if (this.wanted) useSession.setState({ loading: false }); };
  toggle() {
    if (this.wanted) this.pause();
    else { const p = this.project(); if (p && projectDuration(p) > 0) { void this.audio.resume().catch(() => {}); void this.seek(this.time >= projectDuration(p) - 0.0005 ? 0 : this.time, true); } }
  }
  pause() { this.wanted = false; this.video.pause(); this.layers.pause(); cancelAnimationFrame(this.raf); useSession.setState({ playing: false }); this.publish(this.time, true); }
  dispose() {
    this.disposed = true; this.pause(); ++this.token; this.abort.abort(); this.unsubscribe(); this.unsubscribeProxy();
    this.video.removeEventListener('ended', this.ended); this.video.removeEventListener('waiting', this.waiting); this.video.removeEventListener('playing', this.ready);
    this.video.removeAttribute('src'); this.video.load();
    this.audio.setVolume(0);
    this.layers.dispose();
  }
}
