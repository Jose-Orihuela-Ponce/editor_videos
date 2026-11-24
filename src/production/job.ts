import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { api } from '../core/api';
import type { Orientation } from '../core/project';
import type { AutomaticProgress, DownloadQuality } from './video';
import { processVideo } from './processVideo';

export interface AutomationRequest {
  jobId: string;
  action: 'process' | 'styles';
  url: string;
  orientation: Orientation;
  quality: DownloadQuality;
  style: string;
  name: string;
  folder: string | null;
  hardware: boolean;
}

export async function runAutomationJob(request: AutomationRequest) {
  const stops: (() => void)[] = [];
  const cancelled = () => invoke<boolean>('automatic_job_cancelled');
  const progress = (stage: string, percent: number) => invoke('automatic_job_progress', { stage, percent });
  let outcome: Record<string, unknown>;
  try {
    const styles = await api.loadPresets(request.orientation);
    if (request.action === 'styles') {
      outcome = { state: 'completed', orientation: request.orientation, styles: styles.map(({ id, name, preset }) => ({ id, name, hasVideo: !!preset.clip })) };
    } else {
      const selected = styles.find(style => style.id === request.style) ?? styles.find(style => style.name === request.style);
      if (!selected?.preset.clip) throw new Error('No se encontró un estilo de video con ese nombre o identificador en la orientación elegida.');
      const report = ({ payload }: { payload: AutomaticProgress }) => {
        if (payload.jobId === request.jobId) void progress(payload.stage, payload.percent).catch(console.error);
      };
      stops.push(await listen<AutomaticProgress>('automatic-progress', report));
      stops.push(await listen<AutomaticProgress>('export-progress', report));
      await progress('Preparando descarga', 0);
      const result = await processVideo({ ...request, preset: selected.preset }, {
        jobId: request.jobId, cancelled,
        onDownload: () => {},
        onPreparing: () => { void progress('Aplicando estilo y preparando textos', 0).catch(console.error); },
      });
      outcome = { ...result, state: result.cancelled ? 'cancelled' : 'completed', orientation: request.orientation, styleId: selected.id, styleName: selected.name };
    }
  } catch (error) {
    const wasCancelled = await cancelled().catch(() => false);
    outcome = { state: wasCancelled ? 'cancelled' : 'failed', error: error instanceof Error ? error.message : String(error) };
  } finally {
    stops.forEach(stop => stop());
  }
  await invoke('automatic_job_finish', { outcome });
}
