import { it, expect, afterAll } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DriveClient, driveConfig } from './drive.mjs';
import { deliverToDrive, referenceName } from './delivery.mjs';
import { saveJson, withLock } from './state.mjs';

const base = resolve('.local/drive-tests');
const root = join(base, randomUUID());
const config = { missing: [], clientId: 'test-client', clientSecret: 'test-secret', refreshToken: 'test-refresh', rootId: '' };
afterAll(async () => { if (root.startsWith(base + sep) && root !== base) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const data = join(root, randomUUID());
  const job = join(data, 'Produccion', 'Trabajos', randomUUID());
  await mkdir(job, { recursive: true });
  const video = join(data, 'video.mp4');
  await writeFile(video, Buffer.alloc(8 * 1024 * 1024 + 32, 73));
  await saveJson(join(job, 'production.json'), { reference: 'César Nakazaki', dataDir: data });
  await saveJson(join(job, 'result.json'), { state: 'completed', path: video });
  return { data, job, video };
}

function fakeDrive() {
  const files = new Map(), sessions = new Map();
  let next = 0, interrupted = false;
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
  const fetcher = async (address, options = {}) => {
    const url = new URL(address), method = options.method ?? 'GET';
    if (url.hostname === 'oauth2.googleapis.com') return json({ access_token: 'test-access' });
    expect(options.headers.Authorization).toBe('Bearer test-access');
    if (url.pathname.endsWith('/generateIds')) return json({ ids: ['id-' + ++next] });
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      return json({ files: [...files.values()].filter(x => x.name === 'Ediciones' && x.mimeType === 'application/vnd.google-apps.folder').map(x => ({ id: x.id })) });
    }
    if (url.pathname === '/drive/v3/files' && method === 'POST') {
      const item = JSON.parse(options.body); files.set(item.id, item); return json(item);
    }
    if (url.pathname.startsWith('/drive/v3/files/')) {
      const item = files.get(decodeURIComponent(url.pathname.split('/').at(-1)));
      return item ? json(item) : new Response(null, { status: 404 });
    }
    if (url.pathname.startsWith('/upload/drive/v3/files')) {
      const item = JSON.parse(options.body);
      if (method === 'PATCH') item.id = decodeURIComponent(url.pathname.split('/').at(-1));
      const session = 'session-' + ++next;
      sessions.set(session, { item: { ...files.get(item.id), ...item }, chunks: [], received: 0 });
      return new Response(null, { status: 200, headers: { Location: 'https://www.googleapis.com/' + session } });
    }
    const session = sessions.get(url.pathname.slice(1));
    if (session && method === 'PUT') {
      const range = options.headers['Content-Range'];
      if (range.startsWith('bytes */')) return new Response(null, { status: 308, headers: session.received ? { Range: 'bytes=0-' + (session.received - 1) } : {} });
      const match = range.match(/bytes (\d+)-(\d+)\/(\d+)/);
      expect(Number(match[1])).toBe(session.received);
      session.chunks.push(options.body);
      session.received += options.body.length;
      const size = Number(match[3]);
      if (session.received === size) {
        const bytes = Buffer.concat(session.chunks);
        Object.assign(session.item, { size: String(size), md5Checksum: createHash('md5').update(bytes).digest('hex') });
        files.set(session.item.id, session.item);
        return json(session.item);
      }
      if (!interrupted) { interrupted = true; throw new Error('Conexión interrumpida después de recibir los bytes.'); }
      return new Response(null, { status: 308, headers: { Range: 'bytes=0-' + (session.received - 1) } });
    }
    throw new Error('Solicitud inesperada ' + address);
  };
  return { files, sessions, client: new DriveClient(config, fetcher) };
}

it('deja la entrega pendiente cuando faltan credenciales y conserva el MP4', async () => {
  const f = await fixture();
  const result = await deliverToDrive(f.job, { config: driveConfig({}) });
  expect(result.state).toBe('pending_credentials');
  expect(result.missingVariables).toHaveLength(3);
  expect((await readFile(f.video)).length).toBeGreaterThan(0);
});

it('crea Ediciones y una carpeta por trabajo, reanuda y verifica solo video y miniatura', async () => {
  const f = await fixture(), fake = fakeDrive();
  const first = await deliverToDrive(f.job, { config, client: fake.client });
  expect(first.state).toBe('verified');
  expect(fake.files.size).toBe(3);
  const sessionCount = fake.sessions.size;
  const retried = await deliverToDrive(f.job, { config, client: fake.client });
  expect(retried.folderUrl).toBe(first.folderUrl);
  expect(fake.sessions.size).toBe(sessionCount);
  const thumbnail = join(f.data, 'miniatura.png');
  await writeFile(thumbnail, 'imagen de prueba');
  const complete = await deliverToDrive(f.job, { config, client: fake.client, thumbnail });
  expect(complete.state).toBe('verified');
  expect([...fake.files.values()].map(x => x.name).sort()).toEqual(['César Nakazaki', 'Ediciones', 'miniatura.png', 'video.mp4'].sort());
  expect(fake.files.get(complete.videoId).parents).toEqual([first.folderUrl.split('/').at(-1)]);
  const record = JSON.parse(await readFile(join(f.job, 'drive.json'), 'utf8'));
  expect(record.files.video.session).toBeNull();
  expect(record.files.thumbnail.session).toBeNull();
});

it('registra un fallo de Drive y puede reintentar sin repetir la edición', async () => {
  const f = await fixture(), fake = fakeDrive();
  const original = fake.client.verify.bind(fake.client);
  fake.client.verify = async () => { throw new Error('La comprobación falló.'); };
  const failed = await deliverToDrive(f.job, { config, client: fake.client });
  expect(failed.state).toBe('failed');
  fake.client.verify = original;
  const recovered = await deliverToDrive(f.job, { config, client: fake.client });
  expect(recovered.state).toBe('verified');
  expect(recovered.videoId).toBe(failed.videoId);
  expect(fake.files.size).toBe(3);
  const record = JSON.parse(await readFile(join(f.job, 'drive.json'), 'utf8'));
  expect(record.files.video.session).toBeNull();
});

it('excluye ejecuciones simultáneas y valida nombres referenciales', async () => {
  await withLock(join(root, 'lock'), async () => {
    await expect(withLock(join(root, 'lock'), async () => {})).rejects.toThrow('curso');
  });
  await withLock(join(root, 'lock'), async () => {});
  expect(referenceName(' Keiko Fujimori ')).toBe('Keiko Fujimori');
  expect(() => referenceName('')).toThrow('nombre corto');
  expect(() => referenceName('carpeta/otra')).toThrow('nombre corto');
});

it('registra la cancelación de entrega y permite retomar el trabajo', async () => {
  const f = await fixture(), fake = fakeDrive();
  const controller = new AbortController();
  controller.abort();
  const cancelled = await deliverToDrive(f.job, { config, client: fake.client, signal: controller.signal });
  expect(cancelled.state).toBe('cancelled');
  expect(fake.files.size).toBe(0);
  const resumed = await deliverToDrive(f.job, { config, client: fake.client });
  expect(resumed.state).toBe('verified');
});

it('el comando de entrega informa credenciales pendientes sin hacer llamadas a Drive', async () => {
  const f = await fixture();
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/upload-drive.mjs', '--job', f.job], {
    windowsHide: true,
    env: { ...process.env, GOOGLE_DRIVE_CLIENT_ID: '', GOOGLE_DRIVE_CLIENT_SECRET: '', GOOGLE_DRIVE_REFRESH_TOKEN: '' },
  }).catch(error => {
    expect(error.code).toBe(1);
    return { stdout: error.stdout };
  });
  const result = JSON.parse(stdout);
  expect(result.state).toBe('pending_credentials');
  expect(result.reference).toBe('César Nakazaki');
  expect((await readFile(f.video)).length).toBeGreaterThan(0);
});
