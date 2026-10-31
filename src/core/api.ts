import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { createEmptyProject } from './project';
import type { Library, Orientation, Project, ProjectDocument, ToolStatus } from './project';
import type { Media } from './project';
import type { Preset } from './presets';
import type { ExportOptions, ExportResult, RenderPlan } from './export';

export const desktop = isTauri();
export const api = {
  loadPreset: (orientation: Orientation): Promise<Preset> => invoke('load_preset', { orientation }),
  savePreset: (orientation: Orientation, preset: Preset): Promise<Preset> => invoke('save_preset', { orientation, preset }),
  library: (): Promise<Library> => desktop ? invoke('get_library') : Promise.resolve({ baseDir: '', projects: [], warnings: [] }),
  create: (name: string, orientation: Orientation): Promise<Project> => desktop ? invoke('new_project', { name, orientation }) : Promise.resolve(createEmptyProject(name, orientation)),
  tools: (): Promise<ToolStatus[]> => desktop ? invoke('get_tools') : Promise.resolve([]),
  save: (project: Project, filePath: string | null): Promise<ProjectDocument> => invoke('save_project', { project, filePath }),
  open: (filePath: string): Promise<ProjectDocument> => invoke('open_project', { filePath }),
  importMedia: (paths: string[]): Promise<{ media: Media[]; warnings: string[] }> => invoke('import_media', { paths }),
  missingMedia: (project: Project): Promise<string[]> => desktop ? invoke('missing_media', { project }) : Promise.resolve([]),
  exportProject: (project: Project, plan: RenderPlan, options: ExportOptions, jobId: string): Promise<ExportResult> => invoke('export_project', { project, plan, options, jobId }),
  cancelExport: (jobId: string): Promise<void> => invoke('cancel_export', { jobId }),
  exportFolder: (): Promise<string> => desktop ? invoke('get_export_folder') : Promise.resolve('Videos\\ediciones'),
  chooseMedia: async () => {
    if (!desktop) throw new Error('Abre la aplicación de escritorio para importar archivos.');
    return open({ title: 'Agregar archivos', multiple: true, directory: false, filters: [{ name: 'Videos, imágenes y audio', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'mts', 'm2ts', 'png', 'jpg', 'jpeg', 'bmp', 'webp', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'] }] });
  },
  chooseFolder: () => open({ title: 'Carpeta de exportación', directory: true, multiple: false }),
  chooseProject: async () => {
    if (!desktop) throw new Error('Abre la aplicación de escritorio para acceder a tus proyectos.');
    return open({ title: 'Abrir proyecto', multiple: false, directory: false, filters: [{ name: 'Proyecto de Editor (proyecto.json)', extensions: ['json'] }] });
  },
};
