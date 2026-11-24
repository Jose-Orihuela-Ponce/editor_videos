import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';

export async function readJson(path, fallback = null) {
  for (let attempt = 0; ; attempt++) {
    try { return JSON.parse(await readFile(path, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return fallback;
      // Windows/OneDrive can briefly lock a file during its atomic replacement.
      if (!['EBUSY', 'EACCES', 'EPERM'].includes(error.code) || attempt >= 4) throw error;
      await new Promise(done => setTimeout(done, 100));
    }
  }
}

export async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2));
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export async function withLock(path, action) {
  const key = createHash('sha256').update(resolve(path).toLowerCase()).digest('hex');
  const pipe = '\\\\.\\pipe\\editor-drive-' + key;
  const server = createServer(socket => socket.end());
  await new Promise((done, fail) => {
    server.once('error', error => fail(error.code === 'EADDRINUSE'
      ? new Error('Ya hay una operación de Drive en curso para este trabajo o carpeta.') : error));
    server.listen(pipe, done);
  });
  try { return await action(); }
  finally { await new Promise((done, fail) => server.close(error => error ? fail(error) : done())); }
}
