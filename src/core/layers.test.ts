import { beforeEach, describe, expect, it } from 'vitest';
import { addAudioLayer, addVisualLayer, moveLayer, splitLayer, timelineExtent, updateAudio, updateOverlay } from './layers';
import { createEmptyProject, projectContent } from './project';
import type { Media } from './project';
import { appendMedia, projectDuration } from './timeline';
import { useProjectStore } from './store';

const video: Media = { id: 'v', kind: 'video', path: 'video.mp4', duration: 4, w: 640, h: 360, fps: 24, hasAudio: true };
const sound: Media = { id: 'a', kind: 'audio', path: 'audio.mp3', duration: 8, hasAudio: true };
const image: Media = { id: 'i', kind: 'image', path: 'image.png', duration: 0, w: 200, h: 100, hasAudio: false };
beforeEach(() => useProjectStore.getState().clear());

describe('Capas y pistas libres', () => {
  it('admite superposiciones simultáneas en pistas separadas y conserva los elementos tras la pista principal', () => {
    const p = createEmptyProject('Capas', 'horizontal'); appendMedia(p, [video]);
    const one = addVisualLayer(p, 1), two = addVisualLayer(p, 1, image), three = addVisualLayer(p, 1, video);
    const a = addAudioLayer(p, 0, sound), b = addAudioLayer(p, 0, sound);
    expect(p.overlays.map(o => o.track)).toEqual([0, 1, 2]); expect(p.audio.map(o => o.track)).toEqual([0, 1]);
    expect(projectDuration(p)).toBe(4); expect(timelineExtent(p)).toBe(8);
    moveLayer(p, two, 2, 0); expect(p.overlays.find(o => o.id === two)?.track).not.toBe(0);
    expect([one, two, three, a, b].every(id => p.overlays.some(o => o.id === id) || p.audio.some(o => o.id === id))).toBe(true);
    p.main = []; expect(projectDuration(p)).toBe(8);
  });
  it('divide video, texto y audio preservando ajustes y continuidad en el original', () => {
    const p = createEmptyProject('Dividir', 'vertical');
    const v = addVisualLayer(p, 0, video), text = addVisualLayer(p, 0), a = addAudioLayer(p, 0, sound);
    updateOverlay(p, v, { speed: 2, volume: 1.5 }); updateAudio(p, a, { speed: 2, volume: 0.4 });
    const rightV = splitLayer(p, v, 1), rightText = splitLayer(p, text, 2), rightA = splitLayer(p, a, 1);
    expect(p.overlays.find(o => o.id === v)?.srcEnd).toBe(2); expect(p.overlays.find(o => o.id === rightV)?.srcStart).toBe(2);
    expect(p.overlays.find(o => o.id === rightV)?.volume).toBe(1.5);
    expect(p.overlays.find(o => o.id === rightText)?.text).toBe('Texto');
    expect(p.audio.find(o => o.id === a)?.srcEnd).toBe(2); expect(p.audio.find(o => o.id === rightA)?.srcStart).toBe(2);
  });
  it('agrupa gestos de posición y recupera el documento completo con deshacer/rehacer', () => {
    const p = createEmptyProject('Historial de capas', 'horizontal'); const id = addVisualLayer(p, 0);
    const store = useProjectStore.getState; store().load(p, 'prueba.json'); const initial = projectContent(p);
    store().edit(draft => updateOverlay(draft, id, { posX: 50 }), 'drag');
    store().edit(draft => updateOverlay(draft, id, { posX: 90, posY: 30 }), 'drag');
    const changed = projectContent(store().project!); expect(store().past).toHaveLength(1);
    store().undo(); expect(projectContent(store().project!)).toBe(initial);
    store().redo(); expect(projectContent(store().project!)).toBe(changed);
  });
});
