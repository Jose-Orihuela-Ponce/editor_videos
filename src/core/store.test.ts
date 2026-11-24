import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from './project';
import { hasUnsavedChanges, useProjectStore } from './store';
import { makeClip } from './timeline';
import { addVisualLayer } from './layers';
import type { Media } from './project';

beforeEach(() => useProjectStore.getState().clear());
describe('Historial y guardado', () => {
  it('no aplica el resultado de un guardado anterior sobre otro proyecto abierto', () => {
    const first = createEmptyProject('Primero', 'horizontal');
    const next = createEmptyProject('Segundo', 'vertical');
    useProjectStore.getState().load(first);
    useProjectStore.getState().load(next);
    useProjectStore.getState().markSaved({ project: first, filePath: 'C:/primero/proyecto.json', recovered: false }, first);
    expect(useProjectStore.getState().project?.id).toBe(next.id);
    expect(useProjectStore.getState().filePath).toBeNull();
  });
  it('agrupa una edición de nombre y recupera el estado guardado al deshacer', () => {
    const project = createEmptyProject('Viaje', 'horizontal');
    const store = useProjectStore.getState;
    store().load(project, 'C:/proyecto.json');
    store().edit(p => { p.name = 'Viaje a'; }, 'name-edit');
    store().edit(p => { p.name = 'Viaje al sur'; }, 'name-edit');
    expect(store().past).toHaveLength(1);
    expect(hasUnsavedChanges()).toBe(true);
    store().undo();
    expect(store().project?.name).toBe('Viaje');
    expect(hasUnsavedChanges()).toBe(false);
    store().redo();
    expect(store().project?.name).toBe('Viaje al sur');
  });
  it('no pierde cambios hechos durante un guardado y permite volver al punto guardado', () => {
    const source = createEmptyProject('Original', 'horizontal');
    const store = useProjectStore.getState;
    store().load(source);
    store().setOrientation('vertical');
    store().markSaved({ project: { ...source, updatedAt: new Date().toISOString() }, filePath: 'C:/proyecto.json', recovered: false }, source);
    expect(store().project?.orientation).toBe('vertical');
    expect(hasUnsavedChanges()).toBe(true);
    store().undo();
    expect(hasUnsavedChanges()).toBe(false);
  });
  it('descarta rehacer tras una nueva edición y conserva los datos de herramientas', () => {
    const source = createEmptyProject('Prueba', 'vertical'); source.toolData = { futureTool: { strength: 0.7 } };
    const store = useProjectStore.getState;
    store().load(source);
    store().setOrientation('horizontal'); store().undo();
    store().edit(p => { p.name = 'Nuevo'; });
    expect(store().future).toHaveLength(0);
    expect(store().project?.toolData).toEqual(source.toolData);
    expect(store().project?.canvas).toEqual({ w: 1080, h: 1920, fps: 30 });
  });
  it('mantiene posiciones válidas al cambiar de orientación y restaura las originales al deshacer', () => {
    const source = createEmptyProject('Encuadre', 'horizontal');
    const media: Media = { id: 'clip', path: 'clip.mp4', kind: 'video', duration: 1, w: 1920, h: 1080, hasAudio: false };
    source.media = [media];
    source.main = [{ ...makeClip(media, 0), zoom: 5, posX: 2300, posY: 100 }];
    addVisualLayer(source, 0);
    source.overlays[0].posX = -2500;
    const store = useProjectStore.getState;
    store().load(source, 'C:/proyecto.json');
    store().setOrientation('vertical');
    expect(store().project?.main[0]).toMatchObject({ posX: 2160, posY: 100, zoom: 5 });
    expect(store().project?.overlays[0].posX).toBe(-2160);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().project).toEqual(source);
    expect(hasUnsavedChanges()).toBe(false);
    store().redo();
    expect(store().project?.main[0].posX).toBe(2160);
    expect(store().project?.orientation).toBe('vertical');
  });
});
