import { create } from 'zustand';
import type { Clip, ClipSettings, Orientation, Project, TextStyle } from './project';
import { api, desktop } from './api';
import { clipDuration } from './timeline';
import { addVisualLayer, moveLayer, updateOverlay } from './layers';
import { updateClipSettings } from './clipSettings';
export type StyleText = { text: string; style: TextStyle; posX: number; posY: number; scale: number; start: number; duration: number };
export type Preset = { clip: ClipSettings | null; text: TextStyle | null; texts?: StyleText[] };
export type Clipboard = { kind: 'clip'; value: ClipSettings } | { kind: 'text'; value: TextStyle };
export function clipSettings(c: Clip): ClipSettings {
  return { speed:c.speed, volume:c.volume, flipH:c.flipH, flipV:c.flipV, zoom:c.zoom, stretchX:c.stretchX, stretchY:c.stretchY, posX:c.posX, posY:c.posY, crop:{...c.crop} };
}
export const defaultClipSettings = (): ClipSettings => ({ speed:1, volume:1, flipH:false, flipV:false, zoom:1, stretchX:1, stretchY:1, posX:0, posY:0, crop:{x:0,y:0,w:1,h:1} });
export function captureStyle(project: Project, clip: Clip): Preset {
  const end = clip.start + clipDuration(clip);
  const texts = project.overlays.filter(o => o.type === 'text' && o.style && o.start < end && o.start + o.duration > clip.start)
    .sort((a,b) => (a.track ?? 0) - (b.track ?? 0)).map(o => ({ text:o.text ?? '', style:structuredClone(o.style!), posX:o.posX, posY:o.posY, scale:o.scale,
      start:Math.max(o.start,clip.start)-clip.start, duration:Math.min(o.start+o.duration,end)-Math.max(o.start,clip.start) }));
  return { clip:clipSettings(clip), text:null, texts };
}
export function applyStyle(project: Project, id: string, preset: Preset) {
  if (!preset.clip || !project.main.some(c => c.id === id)) throw new Error('Selecciona un video de la pista principal.');
  updateClipSettings(project,id,preset.clip);
  const clip=project.main.find(c => c.id === id)!, duration=clipDuration(clip);
  for (const t of preset.texts ?? []) {
    const length=Math.min(t.duration,duration-t.start);
    if (length < 1 / project.canvas.fps) continue;
    const layer=addVisualLayer(project,clip.start+t.start);
    updateOverlay(project,layer,{text:t.text,style:{...t.style},posX:t.posX,posY:t.posY,scale:t.scale,duration:length});
    const added = project.overlays.find(o => o.id === layer)!;
    moveLayer(project, layer, added.start, added.track);
  }
}
export function applyStyleToText(project: Project, id: string, template: StyleText) {
  const item=project.overlays.find(o=>o.id===id && o.type==='text'); if (!item) throw new Error('Selecciona un texto.');
  updateOverlay(project,id,{text:template.text,style:{...template.style},posX:template.posX,posY:template.posY,scale:template.scale});
}
interface PresetState {
  presets: Record<Orientation, Preset>; clipboard: Clipboard | null; busy: boolean;
  load: () => Promise<void>; copy: (part: Clipboard) => void;
  saveStyle: (orientation: Orientation, preset: Preset) => Promise<void>;
}
const empty = (): Preset => ({clip:null,text:null});
export const usePresets = create<PresetState>((set,get) => ({
  presets:{horizontal:empty(),vertical:empty()},clipboard:null,busy:false,
  copy: part => set({clipboard:structuredClone(part)}),
  load: async () => { if (!desktop) return; const [horizontal,vertical]=await Promise.all([api.loadPreset('horizontal'),api.loadPreset('vertical')]); set({presets:{horizontal,vertical}}); },
  saveStyle: async (orientation,preset) => {
    if(get().busy) throw new Error('Hay un guardado de estilo en curso.'); set({busy:true});
    try { const saved=desktop ? await api.savePreset(orientation,preset) : structuredClone(preset); set(s=>({presets:{...s.presets,[orientation]:saved}})); }
    finally { set({busy:false}); }
  },
}));
