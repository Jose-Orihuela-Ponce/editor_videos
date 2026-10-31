import { updateClipSettings } from '../core/clipSettings';
import { useProjectStore } from '../core/store';
import { cropTool } from './crop';
import { flipTool } from './flip';
import { speedTool } from './speed';
import { transformTool } from './transform';
import type { ClipTool, ClipToolProps, ToolContext } from './types';
import { volumeTool } from './volume';
import './tools.css';

export const clipTools: ClipTool[] = [transformTool, flipTool, cropTool, speedTool, volumeTool];
export type { ClipToolProps } from './types';

function context(props: ClipToolProps): ToolContext {
  return { ...props, update: (patch, group) => {
    try {
      useProjectStore.getState().edit(project => updateClipSettings(project, props.clip.id, patch), group);
      return true;
    } catch (error) {
      props.onNotice(error instanceof Error ? error.message : String(error), true);
      return false;
    }
  } };
}
export function ClipTools(props: ClipToolProps) {
  const ctx = context(props);
  return <div className="clip-tools" key={props.clip.id}><div className="clip-tools-heading">Video seleccionado</div>{clipTools.map(tool => <details className="clip-tool-group" key={`${props.clip.id}:${tool.id}`} open={tool.id === 'transform' ? true : undefined}><summary>{tool.label}</summary><tool.Panel {...ctx} /></details>)}</div>;
}
export function ClipToolButtons(props: ClipToolProps) {
  const ctx = context(props);
  return <div className="clip-tool-buttons" aria-label="Herramientas del clip">{clipTools.map(tool => tool.ToolbarButton ? <tool.ToolbarButton key={tool.id} {...ctx} /> : null)}</div>;
}
