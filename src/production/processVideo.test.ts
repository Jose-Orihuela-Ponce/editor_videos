import { beforeEach, expect, it, vi } from 'vitest';
import { defaultClipSettings } from '../core/styles';

vi.mock('../core/api', () => ({ api: { exportProject: vi.fn() }, desktop: false }));
vi.mock('./api', () => ({ productionApi: { downloadYoutube: vi.fn() } }));
vi.mock('../core/prepareExport', () => ({ prepareExport: vi.fn() }));

import { api } from '../core/api';
import { productionApi } from './api';
import { prepareExport } from '../core/prepareExport';
import { processVideo } from './processVideo';
import type { AutomaticInput } from './processVideo';

const media = { id: 'source', kind: 'video' as const, path: 'original.mkv', duration: 8, w: 640, h: 360, hasAudio: true, fps: 24 };
const input = (): AutomaticInput => ({
  url: 'https://youtu.be/BaW_jenozKc', orientation: 'horizontal', quality: '1080',
  name: 'Resultado', folder: 'salida', hardware: false,
  preset: { clip: { ...defaultClipSettings(), speed: 2 }, text: null },
});
const controls = () => ({ jobId: crypto.randomUUID(), cancelled: vi.fn(() => false), onDownload: vi.fn(), onPreparing: vi.fn() });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(productionApi.downloadYoutube).mockResolvedValue({ cancelled: false, media, title: 'Original', folder: 'descargas' });
  vi.mocked(api.exportProject).mockResolvedValue({ cancelled: false, path: 'salida/Resultado.mp4', encoder: 'libx264' });
  vi.mocked(prepareExport).mockImplementation(async project => ({
    snapshot: project,
    plan: { mediaIds: [media.id], graph: 'graph', duration: 4, width: 640, height: 360, fps: 24, videoLabel: 'vout', audioLabel: 'aout' },
  }));
});

it('usa una instantánea del estilo y devuelve el MP4 publicado y el original', async () => {
  const settings = input(), callbacks = controls();
  vi.mocked(productionApi.downloadYoutube).mockImplementation(async () => {
    settings.preset.clip!.speed = 4;
    return { cancelled: false, media, title: 'Original', folder: 'descargas' };
  });
  const result = await processVideo(settings, callbacks);
  expect(prepareExport).toHaveBeenCalledWith(expect.objectContaining({ main: [expect.objectContaining({ speed: 2 })] }), expect.anything());
  expect(api.exportProject).toHaveBeenCalledWith(expect.anything(), expect.anything(),
    { format: 'mp4', quality: 'original', name: 'Resultado', folder: 'salida', hardware: false }, callbacks.jobId);
  expect(result).toMatchObject({ cancelled: false, path: 'salida/Resultado.mp4', originalFolder: 'descargas' });
});

it('cancela antes de descargar y entre preparación y exportación', async () => {
  const callbacks = controls();
  callbacks.cancelled.mockReturnValue(true);
  expect(await processVideo(input(), callbacks)).toMatchObject({ cancelled: true });
  expect(productionApi.downloadYoutube).not.toHaveBeenCalled();
  callbacks.cancelled.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);
  expect(await processVideo(input(), callbacks)).toMatchObject({ cancelled: true });
  expect(prepareExport).toHaveBeenCalledTimes(1);
  expect(api.exportProject).not.toHaveBeenCalled();
});

it('propaga fallos y rechaza un éxito de exportación sin archivo', async () => {
  vi.mocked(productionApi.downloadYoutube).mockRejectedValueOnce(new Error('Error de descarga'));
  await expect(processVideo(input(), controls())).rejects.toThrow('Error de descarga');
  expect(api.exportProject).not.toHaveBeenCalled();
  vi.mocked(api.exportProject).mockResolvedValueOnce({ cancelled: false, path: null, encoder: '' });
  await expect(processVideo(input(), controls())).rejects.toThrow('sin indicar un archivo');
});
