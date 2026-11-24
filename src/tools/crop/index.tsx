import { Crop } from 'lucide-react';
import CropFields from './CropFields';
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
    <CropFields crop={crop} minWidth={minWidth} minHeight={minHeight} onNotice={onNotice} onChange={(crop, group) => update({ crop }, group)} />
  </section>;
}
export const cropTool: ClipTool = {
  id: 'crop', label: 'Recorte de imagen', scope: 'clip', inPreset: true, defaults: { crop: { x: 0, y: 0, w: 1, h: 1 } }, Panel: CropPanel, ToolbarButton: CropButton,
  applyPreview: (settings, context) => ({ crop: previewCrop(context.media, context.canvas, settings) }),
  exportFilter: (_, context) => ({ video: exportCrop(context.geometry.crop) }),
};
