import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from './project';
import type { Media } from './project';
import { appendMedia } from './timeline';
import { useProjectStore } from './store';
import { useSession } from './session';
import { updateClipSettings } from './clipSettings';

const audio = vi.hoisted(() => ({ setVolume: vi.fn(), resume: vi.fn(async () => {}) }));
vi.mock('./previewAudio', () => ({ previewAudio: vi.fn(() => audio) }));
vi.mock('./api', () => ({ desktop: false }));
import { PlaybackController } from './playback';

class FakeVideo extends EventTarget {
  preload = ''; src = ''; hidden = false; readyState = 1; error = null;
  seeking = false; ended = false; playbackRate = 1; preservesPitch = false;
  asyncSeeking = false;
  private position = 0;
  get currentTime() { return this.position; }
  set currentTime(value: number) { this.position = value; this.seeking = this.asyncSeeking; }
  pause = vi.fn();
  play = vi.fn(async () => {});
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = ''; });
  metadata() { this.readyState = 1; this.dispatchEvent(new Event('loadedmetadata')); }
  seeked() { this.seeking = false; this.dispatchEvent(new Event('seeked')); }
}

const source: Media = { id: 'first', kind: 'video', path: 'C:/first.mp4', duration: 8, w: 1920, h: 1080, fps: 30, hasAudio: true };
let controllers: PlaybackController[] = [];
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function prepare(video = new FakeVideo()) {
  const project = createEmptyProject('Reproducción', 'horizontal');
  appendMedia(project, [source, { ...source, id: 'second', path: 'C:/second.mp4' }]);
  project.main[1].volume = 0.6;
  useProjectStore.getState().load(project);
  const controller = new PlaybackController(video as unknown as HTMLVideoElement);
  controllers.push(controller);
  return { project, video, controller };
}

beforeEach(() => {
  vi.clearAllMocks(); controllers = [];
  useProjectStore.getState().clear();
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { controllers.forEach(controller => controller.dispose()); useProjectStore.getState().clear(); vi.unstubAllGlobals(); });

describe('Reproducción al editar transformaciones', () => {
  it('cambia imagen y ganancia durante la reproducción sin pausar, recargar ni buscar el original', async () => {
    const { project, video, controller } = prepare();
    await settle(); controller.toggle(); await settle();
    expect(useSession.getState().playing).toBe(true);
    video.pause.mockClear(); video.play.mockClear(); video.load.mockClear(); audio.setVolume.mockClear();
    useProjectStore.getState().edit(p => updateClipSettings(p, project.main[0].id, { volume: 1.8, zoom: 1.2, posY: 15, flipH: true }));
    expect(video.pause).not.toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
    expect(video.load).not.toHaveBeenCalled();
    expect(audio.setVolume).toHaveBeenLastCalledWith(1.8);
    expect(useSession.getState().playing).toBe(true);
    expect(video.hidden).toBe(false);
    expect(controller.time).toBe(0);
  });

  it('al cambiar velocidad pausa y vuelve a sincronizar el tiempo original', async () => {
    const { project, video, controller } = prepare();
    await settle(); await controller.seek(2, true); await settle();
    expect(useSession.getState().playing).toBe(true);
    video.pause.mockClear();
    useProjectStore.getState().edit(p => updateClipSettings(p, project.main[0].id, { speed: 2 }));
    await settle();
    expect(video.pause).toHaveBeenCalled();
    expect(video.playbackRate).toBe(2);
    expect(video.currentTime).toBe(4);
    expect(controller.time).toBe(2);
    expect(useSession.getState().playing).toBe(false);
    expect(useSession.getState().error).toBe('');
  });

  it('silencia y oculta el original al buscar un hueco libre', async () => {
    const { video, controller } = prepare();
    await settle();
    useProjectStore.getState().edit(p => { p.autoJoin = false; p.main[1].start = 12; });
    await settle();
    await controller.seek(10, true); await settle();
    expect(video.hidden).toBe(true);
    expect(audio.setVolume).toHaveBeenLastCalledWith(0);
    expect(useSession.getState()).toMatchObject({ playing: true, loading: false, error: '' });
    expect(controller.time).toBe(10);
  });

  it('descarta la carga anterior cuando otra búsqueda cambia de original', async () => {
    const video = new FakeVideo(); video.readyState = 0;
    const { controller } = prepare(video);
    const latest = controller.seek(10, true);
    video.metadata(); await latest; await settle();
    expect(video.src).toBe('C:/second.mp4');
    expect(video.currentTime).toBe(2);
    expect(controller.time).toBe(10);
    expect(audio.setVolume).toHaveBeenLastCalledWith(0.6);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(useSession.getState()).toMatchObject({ playing: true, loading: false, error: '' });
  });

  it('solo reanuda la última búsqueda cuando varios seeked comparten el elemento', async () => {
    const { video, controller } = prepare(); await settle(); video.asyncSeeking = true;
    const stale = controller.seek(2, true);
    const latest = controller.seek(4, true);
    video.seeked(); await Promise.all([stale, latest]); await settle();
    expect(controller.time).toBe(4);
    expect(video.currentTime).toBe(4);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(useSession.getState()).toMatchObject({ playing: true, loading: false, error: '' });
  });

  it('respeta una pausa mientras el contexto de audio termina de reanudarse', async () => {
    const { video, controller } = prepare(); await settle();
    let finishResume!: () => void;
    audio.resume.mockImplementationOnce(() => new Promise<void>(resolve => { finishResume = resolve; }));
    const pending = controller.seek(2, true);
    await settle(); controller.pause(); finishResume(); await pending; await settle();
    expect(video.play).not.toHaveBeenCalled();
    expect(useSession.getState().playing).toBe(false);
  });
});
