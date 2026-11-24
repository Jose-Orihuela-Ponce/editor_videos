import type { CropRect, Media, Overlay, Project } from './project';
import { fullCrop } from './project';
import { previewCrop } from '../tools/crop/effects';

export function layerGeometry(media: Pick<Media, 'w' | 'h'>, canvas: Project['canvas'], layer: Pick<Overlay, 'scale' | 'posX' | 'posY' | 'crop'>) {
  const sourceWidth = media.w || canvas.w, sourceHeight = media.h || canvas.h;
  const crop = previewCrop(media, canvas, { crop: layer.crop ?? fullCrop });
  const fit = Math.min(canvas.w / crop.w, canvas.h / crop.h);
  const width = crop.w * fit * layer.scale, height = crop.h * fit * layer.scale;
  return { width, height, crop, sourceWidth, sourceHeight, left: (canvas.w - width) / 2 + layer.posX, top: (canvas.h - height) / 2 + layer.posY };
}

export function validateImageCrop({ x, y, w, h }: CropRect, media: Media, canvas: Project['canvas']) {
  const minWidth = Math.min(1, 2 / (media.w || canvas.w));
  const minHeight = Math.min(1, 2 / (media.h || canvas.h));
  if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0
    || w < minWidth - 1e-8 || h < minHeight - 1e-8 || x + w > 1.000001 || y + h > 1.000001) {
    throw new Error('El recorte de la imagen no es válido para el archivo original.');
  }
}
