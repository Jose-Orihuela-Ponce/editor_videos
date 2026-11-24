import { readFile, readdir, mkdir, writeFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillNames = ['crear-miniaturas', 'corregir-textos'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function rejectLinks(root, relative) {
  let path = root;
  for (const part of relative.split('/')) {
    path = join(path, part);
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error('No se sincronizan skills a través de enlaces: ' + relative); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
  }
}
async function optional(path) {
  try { return await readFile(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue;
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw new Error('La fuente de skills debe contener archivos reales.');
    if (entry.isDirectory()) result.push(...await files(join(directory, entry.name), relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result;
}

export async function setupSkills(root, { check = false } = {}) {
  root = resolve(root);
  await rejectLinks(root, '.local/skills-install.json');
  const manifestPath = join(root, '.local', 'skills-install.json');
  const previousBytes = await optional(manifestPath);
  const previous = previousBytes ? JSON.parse(previousBytes.toString('utf8')) : { files: {} };
  const next = { version: 1, files: {} };
  const changes = [];
  for (const name of skillNames) {
    const source = join(root, 'skills', name);
    for (const relative of await files(source)) {
      const key = name + '/' + relative;
      const target = join(root, '.agents', 'skills', name, relative);
      await rejectLinks(root, '.agents/skills/' + name + '/' + relative);
      const bytes = await readFile(join(source, relative));
      const actual = await optional(target);
      const expectedHash = hash(bytes);
      next.files[key] = expectedHash;
      if (actual && hash(actual) === expectedHash) continue;
      // Never overwrite unregistered copies or local edits, including after git pull.
      if (actual && previous.files[key] !== hash(actual)) {
        throw new Error('La copia local tiene cambios propios: ' + key + '. Consérvalos e intégralos en skills/ antes de sincronizar.');
      }
      changes.push({ key, target, bytes });
    }
  }
  if (!check) {
    for (const { target, bytes } of changes) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, JSON.stringify(next, null, 2) + '\n');
  }
  return { skills: skillNames, pendingFiles: changes.map(change => change.key), synchronized: !check || changes.length === 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--check')) throw new Error('Uso: npm run skills:setup o npm run skills:check.');
    const result = await setupSkills(fileURLToPath(new URL('../', import.meta.url)), { check: args.includes('--check') });
    console.log(JSON.stringify(result, null, 2));
    if (!result.synchronized) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
