import { api } from '../core/api';
import { productionApi } from './api';
import { automaticName, automaticProject } from './video';
import type { DownloadQuality } from './video';
import type { Orientation } from '../core/project';
import type { Preset } from '../core/styles';
import { prepareExport } from '../core/prepareExport';

export interface AutomaticInput {
  url: string;
  orientation: Orientation;
  quality: DownloadQuality;
  name: string;
  folder: string | null;
  hardware: boolean;
  preset: Preset;
}

interface Controls {
  jobId: string;
  cancelled: () => boolean | Promise<boolean>;
  onDownload: (folder: string) => void;
  onPreparing: () => void;
}

/** Production applies the shared editing rules and returns the published video. */
export async function processVideo(input: AutomaticInput, controls: Controls) {
  const settings = structuredClone(input);
  if (!settings.preset.clip) throw new Error('El estilo seleccionado no contiene ajustes de video.');
  if (await controls.cancelled()) return { cancelled: true, path: null };
  const download = await productionApi.downloadYoutube(settings.url.trim(), settings.quality, controls.jobId);
  if (download.cancelled || await controls.cancelled()) return { cancelled: true, path: null };
  if (!download.media) throw new Error('No se recibió el video descargado.');
  controls.onDownload(download.folder);
  controls.onPreparing();
  const project = automaticProject(download.media, settings.orientation, settings.preset, settings.name.trim() || download.title);
  const options = {
    format: 'mp4' as const, quality: 'original' as const, hardware: settings.hardware,
    name: automaticName(download.title, settings.name), folder: settings.folder,
  };
  const { snapshot, plan } = await prepareExport(project, options);
  if (await controls.cancelled()) return { cancelled: true, path: null };
  const exported = await api.exportProject(snapshot, plan, options, controls.jobId);
  if (!exported.cancelled && !exported.path) throw new Error('La exportación terminó sin indicar un archivo.');
  return { ...exported, originalFolder: download.folder };
}
