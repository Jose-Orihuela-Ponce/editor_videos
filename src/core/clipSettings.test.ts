import { beforeEach, describe, expect, it } from 'vitest';
import type { ClipSettings, Media } from './project';
import { createEmptyProject, projectContent } from './project';
import { updateClipSettings } from './clipSettings';
import { appendMedia, clipDuration, splitAt } from './timeline';
import { hasUnsavedChanges, useProjectStore } from './store';

const source: Media = { id: 'source', kind: 'video', path: 'C:/source.mp4', duration: 8, w: 1920, h: 1080, fps: 30, hasAudio: true };
const settings: ClipSettings = { speed: 2, volume: 1.75, flipH: true, flipV: true, zoom: 1.5, stretchX: 0.8,
  stretchY: 1.2, posX: 120, posY: -85, crop: { x: 0.1, y: 0.2, w: 0.8, h: 0.6 } };
beforeEach(() => useProjectStore.getState().clear());

describe('Transformaciones de clips', () => {
  it('agrupa un gesto, reubica clips magnéticos y restaura el estado guardado con deshacer', () => {
    const project = createEmptyProject('Transformaciones', 'horizontal');
    appendMedia(project, [source, source]);
    const id = project.main[0].id;
    const store = useProjectStore.getState;
    store().load(project, 'C:/proyecto.json');
    store().edit(p => updateClipSettings(p, id, { speed: 1.5 }), 'speed-gesture');
    store().edit(p => updateClipSettings(p, id, settings), 'speed-gesture');
    expect(store().past).toHaveLength(1);
    expect(store().project!.main[1].start).toBe(4);
    expect(store().project!.main[0].srcEnd).toBe(8);
    expect(hasUnsavedChanges()).toBe(true);
    const finalContent = projectContent(store().project!);
    store().undo();
    expect(store().project).toEqual(project);
    expect(hasUnsavedChanges()).toBe(false);
    store().redo();
    expect(projectContent(store().project!)).toBe(finalContent);
  });

  it('rechaza una velocidad que solapa en modo libre sin cambiar ningún ajuste ni crear historial', () => {
    const project = createEmptyProject('Libre', 'vertical');
    appendMedia(project, [source, source]);
    project.autoJoin = false; project.main[1].start = 10;
    const before = structuredClone(project);
    const store = useProjectStore.getState;
    store().load(project, 'C:/proyecto.json');
    expect(() => store().edit(p => updateClipSettings(p, project.main[0].id, { speed: 0.5, volume: 0 }))).toThrow(/solapa/);
    expect(store().project).toEqual(before);
    expect(store().past).toHaveLength(0);
    store().edit(p => updateClipSettings(p, project.main[0].id, { speed: 2 }));
    expect(store().project!.main[1].start).toBe(10);
    expect(clipDuration(store().project!.main[0])).toBe(4);
  });

  it('conserva todos los ajustes al dividir, serializar, guardar y reabrir', () => {
    const project = createEmptyProject('Persistencia', 'vertical');
    appendMedia(project, [source]);
    updateClipSettings(project, project.main[0].id, settings);
    splitAt(project, 1.25);
    const [left, right] = project.main;
    expect(left.srcEnd).toBe(2.5);
    expect(right.srcStart).toBe(2.5);
    for (const [key, value] of Object.entries(settings)) {
      expect(left[key as keyof ClipSettings]).toEqual(value);
      expect(right[key as keyof ClipSettings]).toEqual(value);
    }
    expect(left.crop).not.toBe(right.crop);
    const store = useProjectStore.getState;
    store().load(project);
    const document = { project: JSON.parse(JSON.stringify(project)), filePath: 'C:/proyecto.json', recovered: false };
    store().markSaved(document, project);
    expect(hasUnsavedChanges()).toBe(false);
    store().clear(); store().load(document.project, document.filePath);
    expect(store().project!.main).toEqual(project.main);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('rechaza datos no finitos y geometría fuera del original antes de mutar', () => {
    const project = createEmptyProject('Validación', 'horizontal');
    appendMedia(project, [source]);
    const before = structuredClone(project);
    const invalid: Partial<ClipSettings>[] = [{ speed: NaN }, { volume: Infinity }, { volume: 2.01 }, { zoom: 0 },
      { zoom: 11 }, { posX: Infinity }, { posY: 2161 }, { crop: { x: 0.5, y: 0, w: 0.6, h: 1 } }];
    for (const patch of invalid) {
      expect(() => updateClipSettings(project, project.main[0].id, patch)).toThrow();
      expect(project).toEqual(before);
    }
  });

  it('no añade historial al confirmar el mismo valor o recorte', () => {
    const project = createEmptyProject('Sin cambios', 'horizontal');
    appendMedia(project, [source]);
    const store = useProjectStore.getState;
    store().load(project, 'C:/proyecto.json');
    store().edit(p => updateClipSettings(p, project.main[0].id, { speed: 1, crop: { x: 0, y: 0, w: 1, h: 1 } }));
    expect(store().past).toHaveLength(0);
    expect(hasUnsavedChanges()).toBe(false);
  });
});
