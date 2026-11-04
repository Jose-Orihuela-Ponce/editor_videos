import type { ExportOptions } from './export';
import { buildRenderPlan, exportSize } from './export';
import type { Project } from './project';
import { projectDuration } from './timeline';
import { drawText } from '../tools/text/render';

/** Shared by manual and automatic export, including the same canvas text renderer. */
export async function prepareExport(project: Project, options: Pick<ExportOptions, 'format' | 'quality'>) {
  const snapshot = structuredClone(project);
  if (options.format === 'mp4') {
    await Promise.all(snapshot.overlays.filter(item => item.type === 'text' && item.style).map(item => {
      const style = item.style!;
      return document.fonts.load(`${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${style.size}px ${JSON.stringify(style.font)}`);
    }));
    await document.fonts.ready;
  }
  const output = exportSize(snapshot, options.quality), duration = projectDuration(snapshot);
  const textImages = options.format === 'mp4' ? snapshot.overlays.filter(item => item.type === 'text' && item.start < duration).map(item => ({
    id: item.id, data: drawText(item, snapshot.canvas, { w: output.width, h: output.height }).surface.toDataURL('image/png'),
  })) : [];
  return { snapshot, plan: buildRenderPlan(snapshot, options, textImages) };
}
