import { useState } from 'react';
import type { ClipTool, ToolContext } from '../types';
import NumberField from '../NumberField';
import { exportTransform, previewTransform } from './effects';

function TransformPanel({ project, clip, update, onNotice }: ToolContext) {
  const [uniform, setUniform] = useState(true);
  const width = clip.zoom * clip.stretchX, height = clip.zoom * clip.stretchY;
  const common = { onNotice, precision: 0 };
  return <section className="clip-tool-section" aria-label="Escala y posición">
    <h3>Escala y posición</h3>
    <label className="tool-checkbox"><input type="checkbox" checked={uniform} onChange={event => setUniform(event.target.checked)} />Escala uniforme</label>
    {uniform ? <>
      <NumberField {...common} label="Escala" unit="%" value={clip.zoom * 100} min={Math.ceil(Math.max(0.01, 0.1 / Math.min(clip.stretchX, clip.stretchY)) * 100 - 1e-8)} max={Math.floor(Math.min(100, 10 / Math.max(clip.stretchX, clip.stretchY)) * 100 + 1e-8)} step={1} slider onChange={(value, group) => update({ zoom: value / 100 }, group)} />
    </> : <div className="tool-field-pair">
      <NumberField {...common} label="Ancho" unit="%" value={width * 100} min={10} max={1000} onChange={(value, group) => update({ zoom: 1, stretchX: value / 100, stretchY: height }, group)} />
      <NumberField {...common} label="Alto" unit="%" value={height * 100} min={10} max={1000} onChange={(value, group) => update({ zoom: 1, stretchX: width, stretchY: value / 100 }, group)} />
    </div>}
    <div className="tool-field-pair">
      <NumberField {...common} label="Posición X" unit="px" value={clip.posX} min={-2 * project.canvas.w} max={2 * project.canvas.w} onChange={(posX, group) => update({ posX }, group)} />
      <NumberField {...common} label="Posición Y" unit="px" value={clip.posY} min={-2 * project.canvas.h} max={2 * project.canvas.h} onChange={(posY, group) => update({ posY }, group)} />
    </div>
  </section>;
}

export const transformTool: ClipTool = {
  id: 'transform', label: 'Escala y posición', scope: 'clip', inPreset: true,
  defaults: { zoom: 1, stretchX: 1, stretchY: 1, posX: 0, posY: 0 }, Panel: TransformPanel,
  applyPreview: (settings, context) => ({ geometry: previewTransform(context.media, context.canvas, settings) }),
  exportFilter: (settings, context) => {
    const { filters, ...layout } = exportTransform(context.geometry, context.output, context.canvas, settings);
    return { video: filters, layout };
  },
};
