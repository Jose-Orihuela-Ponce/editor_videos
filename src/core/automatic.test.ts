import { expect, it } from 'vitest';
import { automaticName, automaticProject } from './automatic';
import { createEmptyProject } from './project';
import type { Media } from './project';
import { applyStyle, captureStyle, clipSettings, defaultClipSettings } from './presets';
import { addVisualLayer, updateOverlay } from './layers';
import { updateClipSettings } from './clipSettings';
import type { Preset } from './presets';
import { makeClip, projectDuration } from './timeline';
import { buildRenderPlan } from './export';
import { useProjectStore } from './store';

const media: Media = { id: 'source', path: 'original.mkv', kind: 'video', duration: 8, w: 1280, h: 720, fps: 29.97, hasAudio: true };
const preset: Preset = { clip: { ...defaultClipSettings(), speed: 2, volume: 0.7, flipH: true, zoom: 1.3, posX: 80 }, text: null, texts: [
  { text: 'Mi estilo', style: { font: 'Montserrat', size: 60, color: '#ffffff', align: 'center' }, posX: 0, posY: 250, scale: 1, start: 1, duration: 8 },
  { text: 'Fuera del video', style: { font: 'Montserrat', size: 60, color: '#ffffff', align: 'center' }, posX: 0, posY: 0, scale: 1, start: 6, duration: 2 },
] };

it.each(['horizontal', 'vertical'] as const)('conserva el estilo completo con velocidad 1.04 y varios textos en %s', orientation => {
  const source = createEmptyProject('Estilo completo', orientation);
  source.media = [structuredClone(media)]; source.main = [makeClip(media, 0)];
  const settings = { speed: 1.04, volume: 1.35, flipH: true, flipV: true, zoom: 1.2, stretchX: 1.1, stretchY: 0.9, posX: 42, posY: -37, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } };
  updateClipSettings(source, source.main[0].id, settings);
  for (const [index, text] of ['Primera línea\nSegunda línea: áéíóú 🎬', 'Otro texto completo'].entries()) {
    const id = addVisualLayer(source, index);
    const layer = source.overlays.find(item => item.id === id)!;
    updateOverlay(source, id, { text, posX: 30 + index, posY: -70, scale: 1.2, duration: 3, style: { ...layer.style!, bold: true, italic: true, underline: true, color: '#ffeedd', bgEnabled: true, bgColor: '#123456', bgOpacity: 0.6, opacity: 0.85, align: 'right' } });
  }
  const saved = JSON.parse(JSON.stringify(captureStyle(source, source.main[0])));
  const automatic = automaticProject(media, orientation, saved, 'Resultado');
  expect(clipSettings(automatic.main[0])).toEqual(settings);
  expect(captureStyle(automatic, automatic.main[0])).toEqual(saved);
  expect(automatic.overlays.map(item => item.text)).toEqual(source.overlays.map(item => item.text));
  const store = useProjectStore.getState;
  const manual = createEmptyProject('Manual', orientation);
  manual.media = [structuredClone(media)]; manual.main = [makeClip(media, 0)];
  store().load(manual);
  store().edit(draft => applyStyle(draft, draft.main[0].id, saved));
  expect(captureStyle(store().project!, store().project!.main[0])).toEqual(saved);
  store().undo(); expect(store().project!.main[0].speed).toBe(1); expect(store().project!.overlays).toHaveLength(0);
  store().redo(); expect(captureStyle(store().project!, store().project!.main[0])).toEqual(saved);
  store().clear();
});

it.each(['horizontal', 'vertical'] as const)('reutiliza la edición manual en %s y limita textos a la duración final', orientation => {
  const savedPreset = JSON.stringify(preset);
  const manual = createEmptyProject('Manual', orientation);
  manual.media = [structuredClone(media)]; manual.main = [makeClip(manual.media[0], 0)];
  applyStyle(manual, manual.main[0].id, structuredClone(preset));
  const automatic = automaticProject(media, orientation, preset, 'Automático');
  expect(projectDuration(automatic)).toBe(4);
  expect(automatic.main[0]).toMatchObject({ srcStart: 0, srcEnd: 8, speed: 2, volume: 0.7, flipH: true, posX: 80 });
  expect(automatic.overlays).toHaveLength(1);
  expect(automatic.overlays[0]).toMatchObject({ text: 'Mi estilo', start: 1, duration: 3 });
  const images = (project: typeof manual) => project.overlays.map(item => ({ id: item.id, data: 'data:image/png;base64,AAAA' }));
  const options = { format: 'mp4', quality: 'original' } as const;
  const { textImages: automaticImages, ...automaticPlan } = buildRenderPlan(automatic, options, images(automatic));
  const { textImages: manualImages, ...manualPlan } = buildRenderPlan(manual, options, images(manual));
  expect(automaticPlan).toEqual(manualPlan);
  expect(automaticImages?.map(image => image.data)).toEqual(manualImages?.map(image => image.data));
  expect(JSON.stringify(preset)).toBe(savedPreset);
});

it('no modifica el proyecto manual ni su historial y rechaza estilo ausente', () => {
  const store = useProjectStore.getState;
  const manual = createEmptyProject('Sin cambios', 'horizontal'); store().load(manual);
  automaticProject(media, 'horizontal', preset, 'Automático');
  expect(store().project).toBe(manual); expect(store().past).toHaveLength(0);
  expect(() => automaticProject(media, 'horizontal', { clip: null, text: null }, '')).toThrow('Guarda primero');
  store().clear();
});

it('genera nombres válidos incluso con títulos reservados o caracteres de Windows', () => {
  expect(automaticName('CON')).toBe('Editado - CON');
  expect(automaticName('Título: ¿video? / prueba. ')).toBe('Editado - Título_ ¿video_ _ prueba');
  expect(automaticName('')).toBe('Editado - Video de YouTube');
  expect(new TextEncoder().encode(automaticName('视频🎬'.repeat(100))).length).toBeLessThanOrEqual(180);
  expect(automaticName('🎬'.repeat(100))).not.toContain('\ufffd');
});

it('usa el nombre elegido para el proyecto y la salida, con título como alternativa', () => {
  const chosen = 'Mi proyecto horizontal';
  expect(automaticProject(media, 'horizontal', preset, chosen).name).toBe(chosen);
  expect(automaticName('Título de YouTube', `  ${chosen}  `)).toBe(chosen);
  expect(automaticName('Título de YouTube', '   ')).toBe('Editado - Título de YouTube');
  expect(automaticName('Título', 'Mi video: prueba?')).toBe('Mi video_ prueba_');
  expect(automaticName('Título', 'CON.txt')).toBe('Video - CON.txt');
  expect(new TextEncoder().encode(automaticName('Título', '视频🎬'.repeat(100))).length).toBeLessThanOrEqual(180);
});
