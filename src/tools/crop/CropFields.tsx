import type { CropRect } from '../../core/project';
import NumberField from '../NumberField';

interface Props {
  crop: CropRect;
  minWidth: number;
  minHeight: number;
  onNotice: (message: string, error?: boolean) => void;
  onChange: (crop: CropRect, group?: string) => boolean;
}

export default function CropFields({ crop, minWidth, minHeight, onNotice, onChange }: Props) {
  return <div className="tool-field-pair">
      <NumberField label="Recorte izquierda" unit="%" value={crop.x * 100} min={0} max={(1 - minWidth) * 100} step={0.1} onNotice={onNotice} onChange={(value, group) => onChange({ ...crop, x: value / 100, w: Math.min(crop.w, 1 - value / 100) }, group)} />
      <NumberField label="Recorte arriba" unit="%" value={crop.y * 100} min={0} max={(1 - minHeight) * 100} step={0.1} onNotice={onNotice} onChange={(value, group) => onChange({ ...crop, y: value / 100, h: Math.min(crop.h, 1 - value / 100) }, group)} />
      <NumberField label="Ancho de recorte" unit="%" value={crop.w * 100} min={minWidth * 100} max={(1 - crop.x) * 100} step={0.1} onNotice={onNotice} onChange={(value, group) => onChange({ ...crop, w: value / 100 }, group)} />
      <NumberField label="Alto de recorte" unit="%" value={crop.h * 100} min={minHeight * 100} max={(1 - crop.y) * 100} step={0.1} onNotice={onNotice} onChange={(value, group) => onChange({ ...crop, h: value / 100 }, group)} />
    </div>;
}
