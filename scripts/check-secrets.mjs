import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

// Local safeguard, not a general-purpose secret detector. Never print matched values.
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--history')) {
  process.stderr.write('Uso: npm run check:secrets -- [--history]\n');
  process.exit(1);
}
function git(args, options = {}) {
  const result = spawnSync('git', args, { maxBuffer: 256 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error('No se pudo completar la revisión de Git.');
  return result.stdout;
}

const root = git(['rev-parse', '--show-toplevel']).toString().trim();
const findings = new Set();
const patterns = [
  ['clave privada', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ['secreto OAuth de Google', /GOCSPX-[A-Za-z0-9_-]{20,}/g],
  ['token de Google', /(?:ya29\.[A-Za-z0-9._-]{20,}|1\/\/[A-Za-z0-9_-]{30,})/g],
  ['clave API de Google', /AIza[A-Za-z0-9_-]{35}/g],
  ['token de GitHub', /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/g],
  ['clave de AWS', /(?:AKIA|ASIA)[A-Z0-9]{16}/g],
  ['clave de OpenAI', /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}/g],
  ['credencial literal', /["']?(?:client_secret|refresh_token|access_token|api_key|password)["']?\s*[:=]\s*["'][A-Za-z0-9_./+=-]{20,}["']/gi],
  ['sesión privada de subida', /https:\/\/(?:www|content)\.googleapis\.com\/[^\s"'<>]*[?&]upload_id=[A-Za-z0-9_-]+/g],
];
const privatePath = /(?:^|\/)(?:\.env(?:\.(?!example$)[^/]*)?|client_secret[^/]*\.json|credentials[^/]*\.json|service[-_]account[^/]*\.json|tokens?\.json|[^/]*\.(?:pem|key|p12|pfx)|\.npmrc|\.pypirc)$/i;
const privateDirectory = /(?:^|\/)(?:\.local|\.codex-attachments|datos|node_modules|target|Produccion\/Trabajos)(?:\/|$)/i;
const mediaPath = /\.(?:mp4|mkv|mov|webm|avi|mp3|wav|m4a)$/i;
const localValues = new Set();
try {
  const env = parseEnv(readFileSync(resolve(root, '.env'), 'utf8'));
  for (const [key, value] of Object.entries(env)) {
    if (/GOOGLE_DRIVE_|SECRET|TOKEN|PASSWORD|API_KEY/.test(key) && value.length >= 8) localValues.add(value);
  }
} catch (error) { if (error.code !== 'ENOENT') throw new Error('No se pudo revisar la configuración privada local.'); }
for (const [key, value] of Object.entries(process.env)) {
  if (/^GOOGLE_DRIVE_/.test(key) && value?.length >= 8) localValues.add(value);
}

function scan(path, buffer, location) {
  const label = JSON.stringify(path); // Escape control characters in filenames too.
  if (privatePath.test(path) || privateDirectory.test(path)) findings.add(`${location} ${label}: archivo privado`);
  if (mediaPath.test(path)) findings.add(`${location} ${label}: medio completo excluido de Git`);
  for (const value of localValues) {
    if (buffer.includes(Buffer.from(value))) findings.add(`${location} ${label}: valor de credencial local`);
  }
  if (buffer.includes(0)) return;
  const content = buffer.toString('utf8');
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split('\n').length;
      findings.add(`${location} ${label}:${line}: ${kind}`);
    }
  }
  if (/(?:^|\/)\.env\.example$/.test(path)) {
    const values = Object.values(parseEnv(content));
    if (values.some(value => value.trim())) findings.add(`${location} ${label}: la plantilla debe tener valores vacíos`);
  }
}

const files = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root })
  .toString().split('\0').filter(Boolean))];
let currentCount = 0;
for (const path of files) {
  let buffer;
  try { buffer = readFileSync(resolve(root, path)); }
  catch (error) { if (error.code === 'ENOENT') continue; throw new Error('No se pudo revisar un archivo publicable.'); }
  scan(path, buffer, 'Actual');
  currentCount++;
}

function scanObjects(objects, location) {
  if (!objects.length) return 0;
  const result = git(['cat-file', '--batch'], { cwd: root, input: objects.map(object => object.id).join('\n') + '\n' });
  let offset = 0;
  let index = 0;
  let count = 0;
  while (offset < result.length) {
    const end = result.indexOf(10, offset);
    if (end < 0) throw new Error('Respuesta incompleta al revisar el historial.');
    const [id, type, bytes] = result.subarray(offset, end).toString().split(' ');
    const size = Number(bytes);
    if (!Number.isSafeInteger(size) || size < 0 || end + 1 + size >= result.length) throw new Error('Objeto de Git no válido.');
    const buffer = result.subarray(end + 1, end + 1 + size);
    offset = end + 1 + size + 1;
    const label = location + ' ' + id.slice(0, 12);
    if (type === 'blob') { scan(objects[index].path, buffer, label); count++; }
    else if (type === 'commit' || type === 'tag') scan(`(mensaje de ${type})`, buffer, label);
    index++;
  }
  return count;
}

// Read the index independently: a staged secret can differ from the working file.
const staged = git(['ls-files', '--stage', '-z'], { cwd: root }).toString().split('\0').filter(Boolean).map(entry => {
  const tab = entry.indexOf('\t');
  const [, id] = entry.slice(0, tab).split(' ');
  return { id, path: entry.slice(tab + 1) };
});
const stagedCount = scanObjects(staged, 'Índice');
let historyCount = 0;
if (args.includes('--history')) {
  const objects = git(['rev-list', '--objects', '--all'], { cwd: root }).toString().trim().split('\n').filter(Boolean).map(line => {
    const [id, ...parts] = line.split(' ');
    return { id, path: parts.join(' ') };
  });
  historyCount = scanObjects(objects, 'Historial');
}

if (findings.size) {
  process.stderr.write('Revisión fallida. Se indican ubicaciones y tipos; los valores están ocultos.\n');
  for (const finding of findings) process.stderr.write(finding + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`Sin hallazgos: ${currentCount} archivos publicables y ${stagedCount} archivos en el índice` +
    (args.includes('--history') ? ` y ${historyCount} versiones de archivo en el historial` : '') + '.\n');
}
