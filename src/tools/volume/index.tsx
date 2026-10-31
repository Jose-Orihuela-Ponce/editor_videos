import { Volume2 } from 'lucide-react';
import NumberField from '../NumberField';
import type { ClipTool, ToolContext } from '../types';
import { exportVolume, previewVolume } from './effects';

function VolumePanel({ clip, update, onNotice }: ToolContext) {
  return <section className="clip-tool-section"><h3>Volumen</h3><NumberField id="clip-volume" label="Volumen" unit="%" value={clip.volume * 100} min={0} max={200} slider onNotice={onNotice} onChange={(value, group) => update({ volume: value / 100 }, group)} />{clip.volume > 1.5 && <p className="tool-volume-warning" role="status">Por encima de 150% puede producirse distorsión.</p>}</section>;
}
function VolumeButton() {
  return <button className="icon-button" type="button" aria-label="Volumen" title="Volumen" onClick={() => { const field = document.getElementById('clip-volume'); const group = field?.closest('details'); if (group) group.open = true; field?.focus({ preventScroll: false }); }}><Volume2 size={16} /></button>;
}
export const volumeTool: ClipTool = { id: 'volume', label: 'Volumen', scope: 'clip', inPreset: true, defaults: { volume: 1 }, Panel: VolumePanel, ToolbarButton: VolumeButton,
  applyPreview: settings => ({ volume: previewVolume(settings.volume) }), exportFilter: settings => ({ audio: exportVolume(settings.volume) }),
};
