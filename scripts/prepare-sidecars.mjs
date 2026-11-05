import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Esta primera versión requiere Windows de 64 bits.');
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'src-tauri', 'binaries');
await mkdir(destination, { recursive: true });
const hashFile = async (path) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};
const manifest = { target: 'x86_64-pc-windows-msvc', binaries: [] };
for (const name of ['ffmpeg', 'ffprobe']) {
  const configured = process.env[`${name.toUpperCase()}_BIN`];
  const source = configured ?? execFileSync('where.exe', [`${name}.exe`], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
  if (!source || !existsSync(source)) throw new Error(`No se encontró ${name}. Instálalo o define ${name.toUpperCase()}_BIN.`);
  const target = join(destination, `${name}-${manifest.target}.exe`);
  const sourceHash = await hashFile(source);
  if (!existsSync(target) || await hashFile(target) !== sourceHash) await copyFile(source, target);
  // A PATH entry may be a package-manager shim that stops working when copied.
  let version;
  try {
    version = execFileSync(target, ['-version'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/)[0];
  } catch (error) {
    throw new Error(`No se pudo ejecutar ${name} copiado. Define ${name.toUpperCase()}_BIN con el ejecutable real, no con un lanzador de Chocolatey o Scoop.`, { cause: error });
  }
  manifest.binaries.push({ name, version, sha256: sourceHash, bytes: (await stat(target)).size });
  process.stdout.write(`${name}: preparado (${Math.round((await stat(target)).size / 1024 / 1024)} MB)\n`);
}
await writeFile(join(destination, 'SOURCES.json'), `${JSON.stringify(manifest, null, 2)}\n`);
