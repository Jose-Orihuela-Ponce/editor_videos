import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const api = 'https://www.googleapis.com/drive/v3';
const fields = 'id,name,mimeType,parents,trashed,size,md5Checksum,webViewLink';
const folderType = 'application/vnd.google-apps.folder';

export function driveConfig(env = process.env) {
  const keys = ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN'];
  return {
    missing: keys.filter(key => !env[key]?.trim()),
    clientId: env[keys[0]]?.trim(), clientSecret: env[keys[1]]?.trim(), refreshToken: env[keys[2]]?.trim(),
    rootId: env.GOOGLE_DRIVE_EDICIONES_FOLDER_ID?.trim() || '',
  };
}

function checked(response) {
  if (!response.ok) throw new Error('Google Drive respondió con el estado ' + response.status + '.');
  return response;
}

export class DriveClient {
  constructor(config, fetcher = fetch, signal) {
    this.config = config;
    this.fetcher = fetcher;
    this.signal = signal;
    this.token = null;
  }

  requestSignal(timeout) {
    return this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
  }

  async accessToken() {
    if (!this.token) {
      const response = await this.fetcher('https://oauth2.googleapis.com/token', {
        method: 'POST', signal: this.requestSignal(60000),
        body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken, grant_type: 'refresh_token' }),
      });
      if (!response.ok) throw new Error('No se pudo autorizar Google Drive. Revisa las credenciales OAuth y el permiso de la cuenta.');
      const result = await response.json();
      if (!result.access_token) throw new Error('Google no devolvió el acceso a Drive.');
      this.token = result.access_token;
    }
    return this.token;
  }

  async request(url, options = {}, refresh = true) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !['www.googleapis.com', 'content.googleapis.com'].includes(target.hostname)) {
      throw new Error('Dirección de carga de Drive no válida.');
    }
    const response = await this.fetcher(url, { ...options, redirect: 'manual',
      signal: this.requestSignal(180000),
      headers: { ...options.headers, Authorization: 'Bearer ' + await this.accessToken() },
    });
    if (response.status === 401 && refresh) {
      this.token = null;
      return this.request(url, options, false);
    }
    return response;
  }

  async metadata(id) {
    const response = await this.request(api + '/files/' + encodeURIComponent(id) + '?fields=' + fields);
    if (response.status === 404) return null;
    return checked(response).json();
  }

  async newId() {
    const response = checked(await this.request(api + '/files/generateIds?count=1&space=drive'));
    const result = await response.json();
    if (!result.ids?.[0]) throw new Error('Drive no devolvió un identificador.');
    return result.ids[0];
  }

  async findRoot() {
    const query = new URLSearchParams({ q: "name = 'Ediciones' and mimeType = '" + folderType + "' and 'root' in parents and trashed = false",
      fields: 'files(id),nextPageToken', pageSize: '100' });
    const response = checked(await this.request(api + '/files?' + query));
    const result = await response.json();
    if (result.files.length > 1 || result.nextPageToken) throw new Error('Hay varias carpetas Ediciones. Indica su identificador en GOOGLE_DRIVE_EDICIONES_FOLDER_ID.');
    return result.files[0]?.id;
  }

  async ensureFolder(id, name, parent) {
    let existing = await this.metadata(id);
    if (!existing) {
      const response = await this.request(api + '/files?fields=' + fields, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, mimeType: folderType, parents: [parent] }),
      });
      if (response.status !== 409) checked(response);
      existing = await this.metadata(id);
    }
    if (!existing || existing.trashed || existing.mimeType !== folderType) throw new Error('La carpeta de Drive no está disponible.');
    return existing;
  }

  async upload(path, name, mimeType, parent, record, persist, report = () => {}) {
    const info = await stat(path);
    if (!info.isFile() || info.size === 0) throw new Error('El archivo para Drive está vacío o no es válido.');
    const hash = createHash('md5');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    const checksum = hash.digest('hex');
    if (!record.id) { record.id = await this.newId(); await persist(); }
    const remote = await this.metadata(record.id);
    const verified = file => file && !file.trashed && file.parents?.includes(parent)
      && file.md5Checksum === checksum && String(file.size) === String(info.size);
    if (verified(remote)) {
      record.session = null;
      await persist();
      return remote;
    }
    if (remote?.trashed) throw new Error('El archivo del trabajo está en la papelera de Drive.');
    if (record.checksum !== checksum) { record.session = null; record.checksum = checksum; await persist(); }
    let offset = 0;
    if (record.session) {
      const status = await this.request(record.session, { method: 'PUT', headers: { 'Content-Range': 'bytes */' + info.size, 'Content-Length': '0' } });
      if (status.ok) { record.session = null; await persist(); return this.verify(record.id, parent, checksum, info.size); }
      if (status.status === 308) offset = received(status, info.size);
      else if ([404, 410].includes(status.status)) { record.session = null; await persist(); }
      else checked(status);
    }
    if (!record.session) {
      const url = remote ? 'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(record.id)
        : 'https://www.googleapis.com/upload/drive/v3/files';
      const metadata = remote ? { name, mimeType } : { id: record.id, name, mimeType, parents: [parent] };
      const response = checked(await this.request(url + '?uploadType=resumable&fields=' + fields, {
        method: remote ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(info.size) },
        body: JSON.stringify(metadata),
      }));
      record.session = response.headers.get('Location');
      if (!record.session) throw new Error('Drive no inició la sesión de subida.');
      await persist();
    }
    const file = await open(path, 'r');
    try {
      let failures = 0;
      while (offset < info.size) {
        const length = Math.min(8 * 1024 * 1024, info.size - offset);
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await file.read(buffer, 0, length, offset);
        if (bytesRead !== length) throw new Error('El archivo cambió durante la subida.');
        let response;
        try {
          response = await this.request(record.session, { method: 'PUT',
            headers: { 'Content-Length': String(length), 'Content-Range': 'bytes ' + offset + '-' + (offset + length - 1) + '/' + info.size },
            body: buffer,
          });
          if (response.status >= 500 || response.status === 429) throw new Error('Transferencia interrumpida.');
        } catch (error) {
          this.signal?.throwIfAborted();
          if (++failures > 3) throw new Error('La transferencia se interrumpió. Puedes reintentar la subida del mismo trabajo.');
          response = await this.request(record.session, { method: 'PUT', headers: { 'Content-Range': 'bytes */' + info.size, 'Content-Length': '0' } });
        }
        if (response.ok) { offset = info.size; break; }
        if (response.status !== 308) checked(response);
        const next = received(response, info.size);
        if (next <= offset && ++failures > 3) throw new Error('La subida no avanzó. Vuelve a intentarlo.');
        offset = next;
        report(Math.floor(offset / info.size * 100));
      }
      const after = await file.stat();
      if (after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw new Error('El archivo cambió durante la subida.');
    } finally { await file.close(); }
    const result = await this.verify(record.id, parent, checksum, info.size);
    record.session = null;
    await persist();
    report(100);
    return result;
  }

  async verify(id, parent, checksum, size) {
    const file = await this.metadata(id);
    if (!file || file.trashed || !file.parents?.includes(parent) || file.md5Checksum !== checksum || String(file.size) !== String(size)) {
      throw new Error('El archivo subido todavía no coincide con el archivo local.');
    }
    return file;
  }
}

function received(response, size) {
  const range = response.headers.get('Range');
  const offset = range ? Number(range.match(/^bytes=0-(\d+)$/)?.[1]) + 1 : 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > size) throw new Error('Drive devolvió una posición de subida no válida.');
  return offset;
}
