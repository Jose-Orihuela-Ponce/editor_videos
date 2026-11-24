import { create } from 'zustand';
import { api, desktop } from './api';
import type { Orientation } from './project';
import type { NamedPreset, Preset, PresetDestination, Clipboard } from './styles';

export * from './styles';

interface PresetState {
  presets: Record<Orientation, NamedPreset[]>; clipboard: Clipboard | null; busy: boolean;
  load: () => Promise<void>; copy: (part: Clipboard) => void;
  saveStyle: (orientation: Orientation, preset: Preset, destination: PresetDestination) => Promise<void>;
}

export const usePresets = create<PresetState>((set, get) => ({
  presets: { horizontal: [], vertical: [] }, clipboard: null, busy: false,
  copy: part => set({ clipboard: structuredClone(part) }),
  load: async () => {
    if (!desktop || get().busy) return;
    set({ busy: true });
    try {
      const [horizontal, vertical] = await Promise.all([api.loadPresets('horizontal'), api.loadPresets('vertical')]);
      set({ presets: { horizontal, vertical } });
    } finally { set({ busy: false }); }
  },
  saveStyle: async (orientation, preset, destination) => {
    if (get().busy) throw new Error('Hay una operación de estilos en curso.');
    set({ busy: true });
    try {
      const saved = await api.savePreset(orientation, preset, destination);
      set(state => ({ presets: { ...state.presets, [orientation]: saved } }));
    } finally { set({ busy: false }); }
  },
}));
