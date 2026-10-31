import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from './project';
import { hasUnsavedChanges, useProjectStore } from './store';

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
});
