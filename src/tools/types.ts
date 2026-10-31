import type { ComponentType } from 'react';
import type { Clip, ClipSettings, Project } from '../core/project';
import type { ClipGeometry } from '../core/geometry';

interface PreviewContext { media: { w?: number; h?: number }; canvas: { w: number; h: number } }
interface ExportContext { geometry: ClipGeometry; output: { w: number; h: number }; canvas: { w: number; h: number } }
interface PreviewEffect {
  geometry?: ClipGeometry;
  crop?: ClipGeometry['crop'];
  flip?: { scaleX: 1 | -1; scaleY: 1 | -1 };
  speed?: number;
  volume?: number;
}
interface ExportEffect { video?: string[]; audio?: string[]; layout?: { width: number; height: number; left: number; top: number } }

export interface ClipToolProps {
  project: Project;
  clip: Clip;
  onNotice: (text: string, error?: boolean) => void;
  cropEditing?: boolean;
  onCropToggle?: () => void;
}
export interface ToolContext extends ClipToolProps {
  update: (patch: Partial<ClipSettings>, group?: string) => boolean;
}
export interface ClipTool {
  id: string;
  label: string;
  scope: 'clip';
  defaults: Partial<ClipSettings>;
  inPreset: boolean;
  Panel: ComponentType<ToolContext>;
  ToolbarButton?: ComponentType<ToolContext>;
  applyPreview: (settings: ClipSettings, context: PreviewContext) => PreviewEffect;
  exportFilter: (settings: ClipSettings, context: ExportContext) => ExportEffect;
}
