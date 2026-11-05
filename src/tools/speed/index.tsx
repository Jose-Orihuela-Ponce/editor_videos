import { Gauge } from 'lucide-react';
import NumberField from '../NumberField';
import type { ClipTool, ToolContext } from '../types';
import { exportSpeed, exportSpeedVideo, previewSpeed } from './effects';

function SpeedPanel({ clip, update, onNotice }: ToolContext) {
  return <section className="clip-tool-section"><h3>Velocidad</h3><NumberField id="clip-speed" label="Velocidad" unit="×" value={clip.speed} min={0.25} max={4} step={0.01} slider onNotice={onNotice} onChange={(speed, group) => update({ speed }, group)} /></section>;
}
function SpeedButton() {
  return <button className="icon-button" type="button" aria-label="Velocidad" title="Velocidad" onClick={() => { const field = document.getElementById('clip-speed'); const group = field?.closest('details'); if (group) group.open = true; field?.focus({ preventScroll: false }); }}><Gauge size={16} /></button>;
}
export const speedTool: ClipTool = { id: 'speed', label: 'Velocidad', scope: 'clip', inPreset: true, defaults: { speed: 1 }, Panel: SpeedPanel, ToolbarButton: SpeedButton,
  applyPreview: settings => ({ speed: previewSpeed(settings.speed) }), exportFilter: settings => ({ video: exportSpeedVideo(settings.speed), audio: exportSpeed(settings.speed) }),
};
