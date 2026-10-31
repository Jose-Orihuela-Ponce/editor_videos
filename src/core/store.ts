import { create } from 'zustand';
import { applyPatches, enablePatches, produceWithPatches } from 'immer';
import type { Draft, Patch } from 'immer';
import type { Orientation, Project, ProjectDocument } from './project';
import { canvasFor, projectContent } from './project';

enablePatches();
interface HistoryEntry { patches: Patch[]; inverse: Patch[]; group?: string }
interface ProjectState {
  project: Project | null; filePath: string | null; savedContent: string | null;
  past: HistoryEntry[]; future: HistoryEntry[];
  load: (project: Project, filePath?: string | null, recovered?: boolean) => void;
  clear: () => void;
  edit: (recipe: (draft: Draft<Project>) => void, group?: string) => void;
  setOrientation: (orientation: Orientation) => void;
  setAutoJoin: (value: boolean) => void;
  undo: () => void; redo: () => void;
  markSaved: (document: ProjectDocument, source: Project) => void;
}
export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null, filePath: null, savedContent: null, past: [], future: [],
  load: (project, filePath = null, recovered = false) => set({ project, filePath, savedContent: filePath && !recovered ? projectContent(project) : null, past: [], future: [] }),
  clear: () => set({ project: null, filePath: null, savedContent: null, past: [], future: [] }),
  edit: (recipe, group) => set((state) => {
    if (!state.project) return state;
    const [project, patches, inverse] = produceWithPatches(state.project, recipe);
    if (!patches.length) return state;
    const last = state.past.at(-1);
    const entry = group && last?.group === group
      ? { patches: [...last.patches, ...patches], inverse: [...inverse, ...last.inverse], group }
      : { patches, inverse, group };
    const past = group && last?.group === group ? [...state.past.slice(0, -1), entry] : [...state.past, entry];
    return { project, past: past.slice(-100), future: [] };
  }),
  setOrientation: (orientation) => get().edit((p) => { p.orientation = orientation; p.canvas = { ...canvasFor(orientation), fps: p.canvas.fps }; }),
  setAutoJoin: (value) => get().edit((p) => {
    p.autoJoin = value;
    if (value) {
      let start = 0;
      for (const clip of p.main) { clip.start = start; start += (clip.srcEnd - clip.srcStart) / clip.speed; }
    }
  }),
  undo: () => set((s) => {
    const entry = s.past.at(-1);
    return s.project && entry ? { project: applyPatches(s.project, entry.inverse), past: s.past.slice(0, -1), future: [...s.future, entry] } : s;
  }),
  redo: () => set((s) => {
    const entry = s.future.at(-1);
    return s.project && entry ? { project: applyPatches(s.project, entry.patches), past: [...s.past, entry], future: s.future.slice(0, -1) } : s;
  }),
  markSaved: (document, source) => set((s) => s.project?.id !== source.id ? s : ({
    // Edits made while the disk write was running must never be overwritten.
    project: s.project && projectContent(s.project) === projectContent(source) ? document.project : s.project,
    filePath: document.filePath, savedContent: projectContent(document.project),
  })),
}));
export function hasUnsavedChanges(state = useProjectStore.getState()) {
  return !!state.project && projectContent(state.project) !== state.savedContent;
}
