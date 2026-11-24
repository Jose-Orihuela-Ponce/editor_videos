import { join, extname } from 'node:path';
import { DriveClient, driveConfig } from './drive.mjs';
import { readJson, saveJson, withLock } from './state.mjs';

export function referenceName(value) {
  const name = value?.trim();
  if (!name || name.length > 100 || /[\x00-\x1f/\\]/.test(name)) throw new Error('Indica un nombre corto para identificar la edición, de hasta 100 caracteres.');
  return name;
}

export async function deliverToDrive(jobDirectory, { thumbnail, config = driveConfig(), client, signal, report = () => {} } = {}) {
  return withLock(join(jobDirectory, 'drive.lock'), async () => {
    const production = await readJson(join(jobDirectory, 'production.json'));
    if (!production?.dataDir) throw new Error('Falta la información de producción de este trabajo.');
    const reference = referenceName(production.reference);
    const edited = await readJson(join(jobDirectory, 'result.json'));
    if (edited?.state !== 'completed' || !edited.path) throw new Error('Primero debe terminar correctamente la edición del video.');
    const path = join(jobDirectory, 'drive.json');
    const state = await readJson(path, { files: {} });
    const persist = () => saveJson(path, state);
    const summary = () => ({
      state: state.state, reference, folderUrl: state.folderId ? 'https://drive.google.com/drive/folders/' + state.folderId : undefined,
      videoId: state.files.video?.id, thumbnailId: state.files.thumbnail?.id,
      error: state.error,
    });
    if (config.missing.length) {
      state.state = 'pending_credentials'; state.error = undefined;
      await persist();
      return { ...summary(), missingVariables: config.missing };
    }
    const drive = client ?? new DriveClient(config, fetch, signal);
    try {
      signal?.throwIfAborted();
      state.state = 'uploading'; state.error = undefined;
      await persist();
      const rootPath = join(production.dataDir, 'Produccion', 'drive-root.json');
      const rootId = await withLock(rootPath + '.lock', async () => {
        const root = await readJson(rootPath, {});
        const id = config.rootId || root.id || await drive.findRoot() || await drive.newId();
        await saveJson(rootPath, { id });
        await drive.ensureFolder(id, 'Ediciones', 'root');
        return id;
      });
      if (!state.folderId) { state.folderId = await drive.newId(); await persist(); }
      await drive.ensureFolder(state.folderId, reference, rootId);
      if (!state.files.video) { state.files.video = {}; await persist(); }
      const video = await drive.upload(edited.path, 'video.mp4', 'video/mp4', state.folderId, state.files.video, persist,
        percent => report('Subiendo video a Drive', percent));
      state.files.video.id = video.id;
      if (thumbnail) {
        const extension = extname(thumbnail).toLowerCase();
        const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }[extension];
        if (!mime) throw new Error('La miniatura debe ser PNG o JPG.');
        if (!state.files.thumbnail) { state.files.thumbnail = {}; await persist(); }
        const image = await drive.upload(thumbnail, mime === 'image/png' ? 'miniatura.png' : 'miniatura.jpg', mime,
          state.folderId, state.files.thumbnail, persist, percent => report('Subiendo miniatura a Drive', percent));
        state.files.thumbnail.id = image.id;
      }
      state.state = 'verified';
      await persist();
      return summary();
    } catch (error) {
      state.state = signal?.aborted ? 'cancelled' : 'failed'; state.error = error instanceof Error ? error.message : String(error);
      await persist();
      return summary();
    }
  });
}
