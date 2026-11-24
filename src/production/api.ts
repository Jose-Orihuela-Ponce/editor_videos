import { invoke } from '@tauri-apps/api/core';
import type { DownloadQuality, DownloadResult } from './video';

export const productionApi = {
  downloadYoutube: (url: string, quality: DownloadQuality, jobId: string): Promise<DownloadResult> =>
    invoke('download_youtube', { url, quality, jobId }),
};
