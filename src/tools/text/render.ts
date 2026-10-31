import type { Overlay, Project } from '../../core/project';

function textLayout(ctx: CanvasRenderingContext2D, overlay: Overlay, canvas: Project['canvas']) {
  const style = overlay.style!, size = style.size * overlay.scale;
  ctx.font = `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${size}px ${JSON.stringify(style.font)}, sans-serif`;
  ctx.textBaseline = 'middle';
  const maxWidth = canvas.w * 0.9;
  const lines: string[] = [];
  for (const paragraph of (overlay.text ?? '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
      else line = candidate;
    }
    lines.push(line);
  }
  const lineHeight = size * 1.2, textWidth = Math.min(maxWidth, Math.max(1, ...lines.map(line => ctx.measureText(line).width)));
  const padX = size * 0.2, padY = size * 0.12, centerX = canvas.w / 2 + overlay.posX, centerY = canvas.h / 2 + overlay.posY;
  const bounds = { left: centerX - textWidth / 2 - padX, top: centerY - lines.length * lineHeight / 2 - padY, width: textWidth + 2 * padX, height: lines.length * lineHeight + 2 * padY };
  return { lines, size, maxWidth, lineHeight, textWidth, centerX, centerY, bounds };
}

export function measureTextBounds(overlay: Overlay, canvas: Project['canvas']) {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx || !overlay.style) throw new Error('No se pudo medir el texto.');
  return textLayout(ctx, overlay, canvas).bounds;
}

/** The same canvas drawing is used on screen and for the PNG passed to FFmpeg. */
export function drawText(overlay: Overlay, canvas: Project['canvas'], output = { w: canvas.w, h: canvas.h }) {
  const surface = document.createElement('canvas'); surface.width = output.w; surface.height = output.h;
  const ctx = surface.getContext('2d'); if (!ctx || !overlay.style) throw new Error('No se pudo dibujar el texto.');
  const style = overlay.style, factor = output.w / canvas.w;
  ctx.setTransform(factor, 0, 0, factor, 0, 0);
  const { lines, size, maxWidth, lineHeight, textWidth, centerX, centerY, bounds } = textLayout(ctx, overlay, canvas);
  if ((style.bgEnabled ?? ((style.bgOpacity ?? 0) > 0)) && style.bgColor && (style.bgOpacity ?? 0) > 0) { ctx.globalAlpha = style.bgOpacity ?? 0; ctx.fillStyle = style.bgColor; ctx.fillRect(bounds.left, bounds.top, bounds.width, bounds.height); }
  ctx.globalAlpha = 1; ctx.fillStyle = style.color; ctx.textAlign = style.align;
  const x = style.align === 'left' ? centerX - textWidth / 2 : style.align === 'right' ? centerX + textWidth / 2 : centerX;
  lines.forEach((line, index) => {
    const y = centerY - lines.length * lineHeight / 2 + (index + 0.5) * lineHeight;
    ctx.fillText(line, x, y, maxWidth);
    if (style.underline && line) {
      const width = Math.min(maxWidth, ctx.measureText(line).width);
      const left = style.align === 'left' ? x : style.align === 'right' ? x - width : x - width / 2;
      ctx.fillRect(left, y + size * 0.4, width, Math.max(1, size * 0.055));
    }
  });
  if ((style.opacity ?? 1) < 1) {
    const result = document.createElement('canvas'); result.width = output.w; result.height = output.h;
    const target = result.getContext('2d'); if (!target) throw new Error('No se pudo dibujar el texto.');
    target.globalAlpha = style.opacity ?? 1; target.drawImage(surface, 0, 0);
    return { surface: result, bounds };
  }
  return { surface, bounds };
}
