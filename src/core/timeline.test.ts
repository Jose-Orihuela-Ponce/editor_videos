import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from './project';
import type { Media } from './project';
import { appendMedia, clipDuration, compact, deleteClip, makeClip, reorderClip, splitAt, trimClip } from './timeline';
import { useProjectStore } from './store';
const a: Media = { id: 'a', kind: 'video', path: 'C:/a.mp4', duration: 10, w: 1920, h: 1080, fps: 30, hasAudio: true };
const b: Media = { ...a, id: 'b', path: 'C:/b.mp4', duration: 5, hasAudio: false };
beforeEach(() => useProjectStore.getState().clear());
describe('Edición de la pista principal', () => {
  it('divide usando el tiempo del original, conserva ajustes y se deshace como una sola acción', () => {
    const project = createEmptyProject('Prueba', 'horizontal'); project.media = [a];
    project.main = [{ ...makeClip(a, 0), srcStart: 2, srcEnd: 10, speed: 2 }];
    useProjectStore.getState().load(project);
    useProjectStore.getState().edit(p => { splitAt(p, 1.5); });
    const clips = useProjectStore.getState().project!.main;
    expect(clips.map(c => [c.start, c.srcStart, c.srcEnd, c.speed])).toEqual([[0, 2, 5, 2], [1.5, 5, 10, 2]]);
    expect(clips.reduce((sum, c) => sum + clipDuration(c), 0)).toBe(4);
    useProjectStore.getState().undo(); expect(useProjectStore.getState().project!.main).toEqual(project.main);
    useProjectStore.getState().redo(); expect(useProjectStore.getState().project!.main).toHaveLength(2);
  });
  it('importa sin duplicar el original y reordena/borrar desplazan solo la pista magnética', () => {
    const project = createEmptyProject('Prueba', 'vertical'); appendMedia(project, [a, b, a]);
    expect(project.media).toHaveLength(2);
    expect(project.main.map(c => c.start)).toEqual([0, 10, 15]);
    const last = project.main[2].id; reorderClip(project, last, project.main[0].id);
    expect(project.main.map(c => c.mediaId)).toEqual(['a', 'a', 'b']);
    expect(project.main.map(c => c.start)).toEqual([0, 10, 20]);
    deleteClip(project, project.main[1].id); expect(project.main.map(c => c.start)).toEqual([0, 10]);
  });
  it('conserva huecos en modo libre y rechaza recortes solapados sin cambiar los datos', () => {
    const project = createEmptyProject('Prueba', 'horizontal'); project.autoJoin = false; appendMedia(project, [a, b]); project.main[1].start = 12;
    const previous = structuredClone(project.main);
    expect(() => trimClip(project, project.main[1].id, 0, 5, 9)).toThrow(/solapa/);
    expect(project.main).toEqual(previous);
    trimClip(project, project.main[0].id, 1, 7);
    expect(project.main[1].start).toBe(12);
    deleteClip(project, project.main[0].id); expect(project.main[0].start).toBe(12);
    compact(project.main); expect(project.main[0].start).toBe(0);
  });
});
