import { expect, it } from 'vitest';
import { automaticName, automaticProject } from './automatic';
import { createEmptyProject } from './project';
import type { Media } from './project';
import { applyStyle, defaultClipSettings } from './presets';
import type { Preset } from './presets';
import { makeClip, projectDuration } from './timeline';
import { buildRenderPlan } from './export';
import { useProjectStore } from './store';

const media: Media = { id: 'source', path: 'original.mkv', kind: 'video', duration: 8, w: 1280, h: 720, fps: 29.97, hasAudio: true };
const preset: Preset = { clip: { ...defaultClipSettings(), speed: 2, volume: 0.7, flipH: true, zoom: 1.3, posX: 80 }, text: null, texts: [
  { text: 'Mi estilo', style: { font: 'Montserrat', size: 60, color: '#ffffff', align: 'center' }, posX: 0, posY: 250, scale: 1, start: 1, duration: 8 },
  { text: 'Fuera del video', style: { font: 'Montserrat', size: 60, color: '#ffffff', align: 'center' }, posX: 0, posY: 0, scale: 1, start: 6, duration: 2 },
] };

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
