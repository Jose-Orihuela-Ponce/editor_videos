import type { Media, Overlay, Project } from './project';

export function layerGeometry(media: Pick<Media, 'w' | 'h'>, canvas: Project['canvas'], layer: Pick<Overlay, 'scale' | 'posX' | 'posY'>) {
  const w = media.w || canvas.w, h = media.h || canvas.h;
  const fit = Math.min(canvas.w / w, canvas.h / h);
  const width = w * fit * layer.scale, height = h * fit * layer.scale;
  return { width, height, left: (canvas.w - width) / 2 + layer.posX, top: (canvas.h - height) / 2 + layer.posY };
}
