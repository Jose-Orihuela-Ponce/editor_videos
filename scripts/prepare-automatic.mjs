import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Se requiere Windows x64.');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Se requiere Node.js 22 o posterior.');
const destination = resolve(dirname(fileURLToPath(import.meta.url)), '../src-tauri/binaries');
const licenses = join(destination, 'automatic-licenses');
await mkdir(licenses, { recursive: true });
const target = 'x86_64-pc-windows-msvc';
const sha = data => createHash('sha256').update(data).digest('hex');
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`No se pudo descargar ${url}: HTTP ${response.status}`);
  return response;
}
// Resolve the tag before downloading; GitHub redirects binaries to an asset CDN.
const version = process.env.YTDLP_VERSION || (await (await get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest')).json()).tag_name;
if (typeof version !== 'string' || !/^[0-9A-Za-z._-]+$/.test(version)) throw new Error('Versión de yt-dlp no válida.');
const response = await get(`https://github.com/yt-dlp/yt-dlp/releases/download/${version}/yt-dlp.exe`);
const bytes = Buffer.from(await response.arrayBuffer());
const checksums = await (await get(`https://github.com/yt-dlp/yt-dlp/releases/download/${version}/SHA2-256SUMS`)).text();
const expected = checksums.split(/\r?\n/).find(line => /\s\*?yt-dlp\.exe$/.test(line))?.split(/\s+/)[0];
if (!expected || sha(bytes) !== expected.toLowerCase()) throw new Error('La suma SHA-256 de yt-dlp no coincide con la publicación oficial.');
const downloader = join(destination, `yt-dlp-${target}.exe`);
await writeFile(`${downloader}.tmp`, bytes);
await rename(`${downloader}.tmp`, downloader);
const node = join(destination, `node-${target}.exe`);
await copyFile(process.execPath, node);
const downloaderVersion = execFileSync(downloader, ['--version'], { encoding: 'utf8', windowsHide: true }).trim();
await writeFile(join(licenses, 'yt-dlp-LICENSE.txt'), await (await get(`https://raw.githubusercontent.com/yt-dlp/yt-dlp/${version}/LICENSE`)).text());
await writeFile(join(licenses, 'yt-dlp-THIRD_PARTY_LICENSES.txt'), await (await get(`https://raw.githubusercontent.com/yt-dlp/yt-dlp/${version}/THIRD_PARTY_LICENSES.txt`)).text());
await writeFile(join(licenses, 'node-LICENSE.txt'), await (await get(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`)).text());
await writeFile(join(destination, 'AUTOMATIC-SOURCES.json'), JSON.stringify({ target, binaries: [
  { name: 'yt-dlp', version: downloaderVersion, source: `https://github.com/yt-dlp/yt-dlp/releases/tag/${version}`, sha256: sha(bytes), bytes: bytes.length },
  { name: 'node', version: process.version, source: `https://nodejs.org/dist/${process.version}/`, sha256: sha(await readFile(node)) },
] }, null, 2) + '\n');
process.stdout.write(`Preparados yt-dlp ${downloaderVersion} y Node.js ${process.version}, con licencias.\n`);
