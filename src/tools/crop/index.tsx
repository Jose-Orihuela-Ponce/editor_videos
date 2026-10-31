import { Crop } from 'lucide-react';
import NumberField from '../NumberField';
import type { ClipTool, ToolContext } from '../types';
import { exportCrop, previewCrop } from './effects';

function CropButton({ cropEditing, onCropToggle }: ToolContext) {
  return <button className={`icon-button ${cropEditing ? 'active' : ''}`} type="button" disabled={!onCropToggle} aria-label="Recortar imagen" aria-pressed={!!cropEditing} title="Recortar imagen" onClick={onCropToggle}><Crop size={16} /></button>;
}
function CropPanel({ project, clip, update, onNotice, cropEditing, onCropToggle }: ToolContext) {
  const crop = clip.crop;
  const media = project.media.find(item => item.id === clip.mediaId);
  const minWidth = Math.min(1, 2 / (media?.w || project.canvas.w));
  const minHeight = Math.min(1, 2 / (media?.h || project.canvas.h));
  return <section className="clip-tool-section"><h3>Recorte de imagen</h3>
    <button className={`tool-crop-toggle ${cropEditing ? 'active' : ''}`} type="button" disabled={!onCropToggle} aria-pressed={!!cropEditing} onClick={onCropToggle}><Crop size={14} />{cropEditing ? 'Terminar recorte' : 'Editar sobre la vista previa'}</button>
    <div className="tool-field-pair">
      <NumberField label="Recorte izquierda" unit="%" value={crop.x * 100} min={0} max={(1 - minWidth) * 100} step={0.1} onNotice={onNotice} onChange={(value, group) => update({ crop: { ...crop, x: value / 100, w: Math.min(crop.w, 1 - value / 100) } }, group)} />
      <NumberField label="Recorte arriba" unit="%" value={crop.y * 100} min={0} max={(1 - minHeight) * 100} step={0.1} onNotice={onNotice} onChange={(value, group) => update({ crop: { ...crop, y: value / 100, h: Math.min(crop.h, 1 - value / 100) } }, group)} />
      <NumberField label="Ancho de recorte" unit="%" value={crop.w * 100} min={minWidth * 100} max={(1 - crop.x) * 100} step={0.1} onNotice={onNotice} onChange={(value, group) => update({ crop: { ...crop, w: value / 100 } }, group)} />
      <NumberField label="Alto de recorte" unit="%" value={crop.h * 100} min={minHeight * 100} max={(1 - crop.y) * 100} step={0.1} onNotice={onNotice} onChange={(value, group) => update({ crop: { ...crop, h: value / 100 } }, group)} />
    </div>
  </section>;
}
export const cropTool: ClipTool = {
  id: 'crop', label: 'Recorte de imagen', scope: 'clip', inPreset: true, defaults: { crop: { x: 0, y: 0, w: 1, h: 1 } }, Panel: CropPanel, ToolbarButton: CropButton,
  applyPreview: (settings, context) => ({ crop: previewCrop(context.media, context.canvas, settings) }),
  exportFilter: (_, context) => ({ video: exportCrop(context.geometry.crop) }),
};
