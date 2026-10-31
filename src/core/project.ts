export type Orientation = 'horizontal' | 'vertical';
export interface Media {
  id: string; kind: 'video' | 'image' | 'audio'; path: string; relPath?: string;
  duration: number; w?: number; h?: number; fps?: number; hasAudio: boolean;
  thumbnail?: string;
}
export interface ClipSettings {
  speed: number; volume: number; flipH: boolean; flipV: boolean;
  zoom: number; stretchX: number; stretchY: number; posX: number; posY: number;
  crop: { x: number; y: number; w: number; h: number };
}
export interface Clip extends ClipSettings {
  id: string; mediaId: string; start: number; srcStart: number; srcEnd: number;
}
export interface TextStyle {
  font: string; size: number; color: string; bgColor?: string;
  bgOpacity?: number; bgEnabled?: boolean; bold?: boolean; italic?: boolean; underline?: boolean; opacity?: number; align: 'left' | 'center' | 'right';
}
export interface Overlay {
  id: string; type: 'text' | 'image' | 'video'; start: number; duration: number;
  posX: number; posY: number; scale: number; track?: number;
  text?: string; style?: TextStyle; mediaId?: string;
  srcStart?: number; srcEnd?: number; speed?: number; volume?: number;
}
export interface AudioClip {
  id: string; mediaId: string; start: number; srcStart: number; srcEnd: number; speed: number; volume: number; track?: number;
}
export interface Project {
  version: 1; id: string; name: string; updatedAt: string;
  orientation: Orientation; canvas: { w: number; h: number; fps: number };
  autoJoin: boolean; copyMedia: boolean;
  media: Media[]; main: Clip[]; overlays: Overlay[]; audio: AudioClip[];
  toolData: Record<string, unknown>;
}
export interface ProjectDocument { project: Project; filePath: string; recovered: boolean }
export interface RecentProject { id: string; name: string; orientation: Orientation; updatedAt: string; filePath: string; recovered: boolean }
export interface Library { baseDir: string; projects: RecentProject[]; warnings: string[] }
export interface ToolStatus { name: string; available: boolean; version: string }

export function canvasFor(orientation: Orientation) {
  return orientation === 'horizontal' ? { w: 1920, h: 1080, fps: 30 } : { w: 1080, h: 1920, fps: 30 };
}
export function createEmptyProject(name: string, orientation: Orientation): Project {
  return {
    version: 1, id: crypto.randomUUID(), name, updatedAt: new Date().toISOString(),
    orientation, canvas: canvasFor(orientation), autoJoin: true, copyMedia: false,
    media: [], main: [], overlays: [], audio: [], toolData: {},
  };
}

// Stable ordering avoids false "unsaved" states after a Rust/JSON round trip.
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, stableValue(val)]));
  return value;
}
export function projectContent(project: Project): string {
  return JSON.stringify(stableValue({ ...project, updatedAt: '' }));
}
