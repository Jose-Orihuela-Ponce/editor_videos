import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupSkills } from './setup-local-skills.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const checks = [];
function command(name, executable, args, required = true) {
  const result = spawnSync(executable, args, { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  checks.push({ name, required, ready: !result.error && result.status === 0 });
}
checks.push({ name: 'Windows x64', required: true, ready: process.platform === 'win32' && process.arch === 'x64' });
const [major, minor] = process.versions.node.split('.').map(Number);
checks.push({ name: 'Node.js 22.12 o 24+', required: true, ready: major === 22 && minor >= 12 || major >= 24 });
command('Git', 'git', ['--version']);
command('Python 3.10+ para capturas', 'python', ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)']);
for (const name of ['ffmpeg', 'ffprobe', 'yt-dlp', 'node']) {
  command('Sidecar ' + name, join(root, 'src-tauri/binaries', name + '-x86_64-pc-windows-msvc.exe'), [name === 'yt-dlp' ? '--version' : name === 'node' ? '--version' : '-version']);
}
command('Rust/Cargo para compilar', 'cargo', ['--version'], false);
let synchronized = false;
try { synchronized = (await setupSkills(root, { check: true })).synchronized; } catch { /* Conflicting local copies require manual reconciliation. */ }
checks.push({ name: 'Skills del repositorio sincronizadas', required: true, ready: synchronized });
for (const name of ['editor-video-ligero.exe', 'editor-video-ligero-automatico.exe']) {
  let ready = true;
  try { await access(resolve(root, 'src-tauri/target/release', name)); } catch { ready = false; }
  checks.push({ name: 'Compilación local ' + name, required: false, ready });
}
console.log(JSON.stringify({ checks, commandsReady: checks.filter(check => check.required).every(check => check.ready),
  manualChecks: ['Abrir Tauri y comprobar WebView2 y el estilo elegido.', 'Verificar en este chat herramientas de imágenes y búsqueda; las skills no las instalan.',
    'Consultar --paths y --list-styles con el ejecutable recién compilado.', 'Autorizar Drive localmente solo si se requiere entrega.'] }, null, 2));
if (checks.some(check => check.required && !check.ready)) process.exitCode = 1;
