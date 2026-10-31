import type { Project } from './project';
import { clipDuration, projectDuration } from './timeline';
import { calculateGeometry } from './geometry';
import { layerGeometry } from './layerGeometry';
import { overlayEnd } from './layers';
import { exportCrop } from '../tools/crop/effects';
import { exportFlip } from '../tools/flip/effects';
import { exportTransform } from '../tools/transform/effects';
import { exportSpeed, exportSpeedVideo } from '../tools/speed/effects';
import { exportVolume } from '../tools/volume/effects';

export type ExportQuality = 'original' | '1080' | '720' | '480';
export interface ExportOptions { format: 'mp4' | 'mp3'; quality: ExportQuality; hardware: boolean; name: string; folder: string | null }
export interface TextImage { id: string; data: string }
export interface RenderPlan {
  textImages?: TextImage[];
  mediaIds: string[]; graph: string; videoLabel: string | null; audioLabel: string;
  duration: number; width: number; height: number; fps: number;
}
export interface ExportProgress { jobId: string; percent: number; stage: string; encoder: string }
export interface ExportResult { cancelled: boolean; path: string | null; encoder: string }
export const numberArg = (value: number) => {
  if (!Number.isFinite(value)) throw new Error('El proyecto contiene un valor temporal no válido.');
  return String(Math.round(value * 1e9) / 1e9);
};
export function exportSize(project: Project, quality: ExportQuality) {
  let scale: number;
  if (quality === 'original') {
    const first = project.media.find(m => m.id === project.main[0]?.mediaId);
    if (!first?.w || !first.h) scale = 1;
    else {
      const w = project.orientation === 'horizontal' ? Math.max(first.w, first.h) : Math.min(first.w, first.h);
      const h = project.orientation === 'horizontal' ? Math.min(first.w, first.h) : Math.max(first.w, first.h);
      scale = Math.min(w / project.canvas.w, h / project.canvas.h);
    }
  } else scale = Number(quality) / 1080;
  const round = quality === 'original' ? Math.floor : Math.round;
  return { width: Math.max(2, round(project.canvas.w * scale / 2) * 2), height: Math.max(2, round(project.canvas.h * scale / 2) * 2) };
}
export function buildRenderPlan(project: Project, options: Pick<ExportOptions, 'format' | 'quality'>, textImages: TextImage[] = []): RenderPlan {
  const duration = projectDuration(project);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Añade contenido a la línea de tiempo para exportar.');
  const firstMedia = project.media.find(m => m.id === project.main[0]?.mediaId);
  const fps = Math.min(60, firstMedia?.fps && firstMedia.fps > 0 ? firstMedia.fps : 30);
  const { width, height } = exportSize(project, options.quality);
  const overlays = project.overlays.filter(o => o.start < duration && overlayEnd(o) > 0)
    .map((overlay, index) => ({ overlay, index })).sort((a, b) => (a.overlay.track ?? 0) - (b.overlay.track ?? 0) || a.index - b.index).map(x => x.overlay);
  const audio = project.audio.filter(a => a.start < duration && a.start + clipDuration(a) > 0);
  const mediaIds = [...new Set([...project.main.map(c => c.mediaId), ...overlays.flatMap(o => o.mediaId ? [o.mediaId] : []), ...audio.map(a => a.mediaId)])];
  const texts = options.format === 'mp4' ? overlays.filter(o => o.type === 'text') : [];
  const images = texts.map(item => {
    const found = textImages.find(image => image.id === item.id);
    if (!found?.data.startsWith('data:image/png;base64,')) throw new Error('No se pudo preparar una imagen de texto para exportar.');
    return found;
  });
  const graph: string[] = [], videoBranches = new Map<string, number>(), audioBranches = new Map<string, number>();
  for (const [index, id] of mediaIds.entries()) {
    const media = project.media.find(m => m.id === id);
    if (!media) throw new Error('No se encontró un original del proyecto.');
    const visualCount = options.format === 'mp4' ? project.main.filter(c => c.mediaId === id).length + overlays.filter(o => o.mediaId === id && (o.type === 'video' || o.type === 'image')).length : 0;
    const audioCount = media.hasAudio ? project.main.filter(c => c.mediaId === id).length + overlays.filter(o => o.type === 'video' && o.mediaId === id).length + audio.filter(a => a.mediaId === id).length : 0;
    if (visualCount) graph.push(`[${index}:v]${visualCount > 1 ? `split=${visualCount}` : 'null'}${Array.from({ length: visualCount }, (_, k) => `[vs${index}_${k}]`).join('')}`);
    if (audioCount) graph.push(`[${index}:a]${audioCount > 1 ? `asplit=${audioCount}` : 'anull'}${Array.from({ length: audioCount }, (_, k) => `[as${index}_${k}]`).join('')}`);
  }
  function branch(id: string, type: 'video' | 'audio') {
    const map = type === 'video' ? videoBranches : audioBranches, index = mediaIds.indexOf(id), n = map.get(id) ?? 0;
    if (index < 0) throw new Error('No se encontró un original de la capa.');
    map.set(id, n + 1); return `${type === 'video' ? 'vs' : 'as'}${index}_${n}`;
  }
  const segments: { v: string; a: string }[] = [];
  let cursor = 0;
  function addGap(length: number) {
    const id = segments.length;
    if (options.format === 'mp4') graph.push(`color=c=black:s=${width}x${height}:r=${numberArg(fps)}:d=${numberArg(length)},setsar=1[v${id}]`);
    graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${numberArg(length)},asetpts=PTS-STARTPTS[a${id}]`);
    segments.push({ v: `v${id}`, a: `a${id}` });
  }
  for (const clip of project.main) {
    if (!Number.isFinite(clip.speed) || clip.speed < 0.25 || clip.speed > 4) throw new Error('La velocidad del clip no es válida.');
    if (!Number.isFinite(clip.volume) || clip.volume < 0 || clip.volume > 2) throw new Error('El volumen del clip debe estar entre 0% y 200%.');
    if (clip.start < cursor - 1e-6) throw new Error('Hay clips solapados en la pista principal.');
    if (clip.start > cursor + 1e-6) addGap(clip.start - cursor);
    const media = project.media.find(m => m.id === clip.mediaId)!;
    const id = segments.length, length = clipDuration(clip), t = numberArg(length);
    if (options.format === 'mp4') {
      const geometry = calculateGeometry(media, project.canvas, clip);
      const transform = exportTransform(geometry, { w: width, h: height }, project.canvas, clip);
      const filters = [`trim=start=${numberArg(clip.srcStart)}:end=${numberArg(clip.srcEnd)}`, ...exportSpeedVideo(clip.speed), ...exportCrop(geometry.crop), ...exportFlip(clip), ...transform.filters, `fps=${numberArg(fps)}`, `tpad=stop_mode=clone:stop_duration=${t}`, `trim=duration=${t}`, 'setpts=PTS-STARTPTS'];
      graph.push(`[${branch(clip.mediaId, 'video')}]${filters.join(',')}[image${id}]`);
      graph.push(`color=c=black:s=${width}x${height}:r=${numberArg(fps)}:d=${t},setsar=1[bg${id}]`);
      graph.push(`[bg${id}][image${id}]overlay=x=${numberArg(transform.left)}:y=${numberArg(transform.top)}:shortest=1:format=yuv444,format=yuv420p[v${id}]`);
    }
    if (media.hasAudio) graph.push(`[${branch(clip.mediaId, 'audio')}]atrim=start=${numberArg(clip.srcStart)}:end=${numberArg(clip.srcEnd)},asetpts=PTS-STARTPTS,${[...exportSpeed(clip.speed), ...exportVolume(clip.volume)].join(',')},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${t}[a${id}]`);
    else graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${t},asetpts=PTS-STARTPTS[a${id}]`);
    segments.push({ v: `v${id}`, a: `a${id}` }); cursor = clip.start + length;
  }
  if (!segments.length) addGap(duration);
  if (options.format === 'mp4') graph.push(`${segments.map(s => `[${s.v}][${s.a}]`).join('')}concat=n=${segments.length}:v=1:a=1[basev][mainmix]`);
  else graph.push(`${segments.map(s => `[${s.a}]`).join('')}concat=n=${segments.length}:v=0:a=1[mainmix]`);

  let currentVideo = 'basev';
  if (options.format === 'mp4') {
    for (const [index, layer] of overlays.entries()) {
      let image: string;
      if (layer.type === 'text') {
        image = `text${index}`;
        graph.push(`[${mediaIds.length + images.findIndex(i => i.id === layer.id)}:v]format=rgba,setpts=PTS-STARTPTS[${image}]`);
      } else {
        const media = project.media.find(m => m.id === layer.mediaId);
        if (!media || media.kind !== layer.type) throw new Error('No se encontró el original de la capa.');
        const g = layerGeometry(media, project.canvas, layer), k = width / project.canvas.w;
        const w = Math.max(2, Math.floor(g.width * k / 2) * 2), h = Math.max(2, Math.floor(g.height * k / 2) * 2);
        image = `layer${index}`;
        if (layer.type === 'image') graph.push(`[${branch(media.id, 'video')}]format=rgba,scale=${w}:${h},setsar=1,setpts=PTS-STARTPTS[${image}]`);
        else {
          const speed = layer.speed ?? 1, from = layer.srcStart ?? 0, to = layer.srcEnd ?? media.duration;
          graph.push(`[${branch(media.id, 'video')}]trim=start=${numberArg(from)}:end=${numberArg(to)},${exportSpeedVideo(speed).join(',')},scale=${w}:${h},setsar=1,fps=${numberArg(fps)},tpad=stop_mode=clone:stop_duration=${numberArg(1 / fps)},trim=duration=${numberArg(layer.duration)},setpts=PTS+${numberArg(layer.start)}/TB[${image}]`);
        }
      }
      const media = project.media.find(m => m.id === layer.mediaId);
      const g = media ? layerGeometry(media, project.canvas, layer) : null, k = width / project.canvas.w;
      const lw = g ? Math.max(2, Math.floor(g.width * k / 2) * 2) : width, lh = g ? Math.max(2, Math.floor(g.height * k / 2) * 2) : height;
      const left = g ? (width - lw) / 2 + layer.posX * k : 0, top = g ? (height - lh) / 2 + layer.posY * k : 0;
      const next = `composite${index}`, eof = layer.type === 'video' ? 'eof_action=pass:repeatlast=0' : 'eof_action=repeat:repeatlast=1';
      graph.push(`[${currentVideo}][${image}]overlay=x=${numberArg(left)}:y=${numberArg(top)}:enable='gte(t,${numberArg(layer.start)})*lt(t,${numberArg(overlayEnd(layer))})':${eof}:format=auto[${next}]`);
      currentVideo = next;
    }
    graph.push(`[${currentVideo}]format=yuv420p[vout]`);
  }
  const audioLayers: string[] = [];
  function addAudio(id: string, from: number, to: number, speed: number, volume: number, start: number) {
    const media = project.media.find(m => m.id === id); if (!media?.hasAudio) return;
    if (![from, to, speed, volume, start].every(Number.isFinite) || speed < 0.25 || speed > 4 || volume < 0 || volume > 2 || from < 0 || to <= from || start < 0) throw new Error('Los ajustes de audio de la capa no son válidos.');
    const label = `extraaudio${audioLayers.length}`, length = Math.min((to - from) / speed, duration - start);
    graph.push(`[${branch(id, 'audio')}]atrim=start=${numberArg(from)}:end=${numberArg(to)},asetpts=PTS-STARTPTS,${[...exportSpeed(speed), ...exportVolume(volume)].join(',')},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${numberArg(length)},adelay=${Math.round(start * 48000)}S:all=1[${label}]`);
    audioLayers.push(label);
  }
  for (const layer of overlays) if (layer.type === 'video' && layer.mediaId) addAudio(layer.mediaId, layer.srcStart ?? 0, layer.srcEnd ?? 0, layer.speed ?? 1, layer.volume ?? 1, layer.start);
  for (const layer of audio) addAudio(layer.mediaId, layer.srcStart, layer.srcEnd, layer.speed, layer.volume, layer.start);
  if (audioLayers.length) graph.push(`[mainmix]${audioLayers.map(id => `[${id}]`).join('')}amix=inputs=${audioLayers.length + 1}:duration=longest:normalize=0[mix]`);
  else graph.push('[mainmix]anull[mix]');
  graph.push(`[mix]alimiter=limit=0.95:level=0:latency=1,apad,atrim=duration=${numberArg(duration)},asetpts=PTS-STARTPTS[aout]`);
  return { mediaIds, textImages: images, graph: graph.join(';\n'), videoLabel: options.format === 'mp4' ? 'vout' : null, audioLabel: 'aout', duration, width, height, fps };
}
