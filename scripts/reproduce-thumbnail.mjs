import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, access, copyFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const referenceDirectory = join(root, 'skills/crear-miniaturas/references');
const registry = JSON.parse(await readFile(join(referenceDirectory, 'reproduction-cases.json'), 'utf8'));
function execute(executable, args, timeout = 120000) {
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('Falló ' + executable.split(/[\\/]/).at(-1) + '. Comprueba las dependencias y la disponibilidad de la fuente.');
  return result.stdout.trim();
}
async function save(path, value) { await writeFile(path, JSON.stringify(value, null, 2) + '\n'); }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
const args = process.argv.slice(2);
const options = new Map();
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (options.has(key)) throw new Error('Opción repetida.');
  if (key === '--list' || key === '--help') options.set(key, true);
  else if (['--case', '--video', '--portrait'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) options.set(key, args[++i]);
  else throw new Error('Usa --case ID, opcionalmente --video ARCHIVO y --portrait FOTO; consulta --list.');
}
if (options.has('--help')) {
  console.log('npm run thumbnail:reproduce -- --list\nnpm run thumbnail:reproduce -- --case approved-01 [--video ORIGINAL] [--portrait FOTO]\nPrepara capturas y request.json en .local/reproductions/. El agente genera y revisa la imagen; no se sube a Drive.');
} else if (options.has('--list')) {
  console.log(JSON.stringify(registry.cases.map(({ id, name, approval, videoUrl }) => ({ id, name, approval, videoUrl })), null, 2));
} else {
  const example = registry.cases.find(item => item.id === options.get('--case'));
  if (!example) throw new Error('Elige uno de los casos de --list.');
  const base = join(root, '.local/reproductions', example.id);
  await mkdir(base, { recursive: true });
  const output = await mkdtemp(join(base, 'run-'));
  const binary = name => join(root, 'src-tauri/binaries', name + '-x86_64-pc-windows-msvc.exe');
  let video = options.has('--video') ? resolve(options.get('--video')) : null;
  if (!video) {
    const cache = join(base, 'source.json');
    if (await exists(cache)) {
      const previous = JSON.parse(await readFile(cache, 'utf8'));
      if (previous.url === example.videoUrl && await exists(previous.path)) video = previous.path;
    }
    if (!video) {
      console.log('Descargando el original de prueba, sin editar ni entregar en Drive.');
      const downloaded = execute(binary('yt-dlp'), ['--ignore-config', '--no-plugin-dirs', '--no-remote-components', '--no-cache-dir',
        '--no-playlist', '--no-warnings', '--no-progress', '--no-overwrites', '--match-filter', '!is_live & !is_upcoming',
        '--no-js-runtimes', '--js-runtimes', 'node:' + binary('node'),
        '--ffmpeg-location', binary('ffmpeg'), '-f', 'bv[height<=720]+ba/b[height<=720]', '--merge-output-format', 'mkv',
        '--print', 'after_move:filepath', '-o', join(base, 'source.%(ext)s'), '--', example.videoUrl], 900000);
      video = resolve(downloaded.split(/\r?\n/).at(-1));
      await access(video);
      await save(cache, { url: example.videoUrl, path: video });
    }
  }
  await access(video);
  const frames = {};
  const frameDirectory = join(output, 'frames');
  const extractor = join(root, 'skills/crear-miniaturas/scripts/extract_frames.py');
  for (const [role, frame] of Object.entries(example.frames)) {
    execute('python', [extractor, '--video', video, '--output', frameDirectory, '--times', String(frame.seconds), '--role', frame.role,
      '--columns', '1', '--preview-width', '600', '--ffmpeg', binary('ffmpeg'), '--ffprobe', binary('ffprobe')]);
    const manifest = JSON.parse(await readFile(join(frameDirectory, 'candidates.json'), 'utf8'));
    const candidate = manifest.candidates.find(candidate => candidate.role === frame.role && Math.abs(candidate.seconds - frame.seconds) < 0.000001);
    if (!candidate) throw new Error('No se obtuvo el instante del caso.');
    frames[role] = { ...frame, runCandidateId: candidate.id, path: join(frameDirectory, candidate.original) };
  }
  let portrait;
  if (options.has('--portrait')) {
    portrait = resolve(options.get('--portrait'));
    await access(portrait);
  } else {
    if (!example.portrait.imageUrl) throw new Error('Busca una foto identificada en la página de referencia y vuelve a ejecutar con --portrait.');
    const response = await fetch(example.portrait.imageUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('La foto no está disponible. Busca otra en su página y registra la fuente con --portrait.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) throw new Error('La foto de referencia es demasiado grande.');
    portrait = join(output, 'portrait' + (extname(new URL(example.portrait.imageUrl).pathname) || '.jpg'));
    await writeFile(portrait, bytes);
  }
  const golden = resolve(referenceDirectory, example.expectedImage);
  await access(golden);
  const quote = example.quotationMarks ? ['“', '”'] : ['', ''];
  const text = quote[0] + example.textLines.join('\n') + quote[1];
  const prompt = `Compose one 16:9 photographic Spanish YouTube thumbnail matching the approved style reference.\n` +
    `Input 1 is the selected interviewee on the LEFT: ${frames.interviewee.description}\n` +
    `Input 2 is the selected presenter on the RIGHT: ${frames.presenter.description}\n` +
    `Input 3 is ${example.portrait.subject}, to crop by head and upper shoulders into ONE upper-center circle with a thin dark rim.\n` +
    `Input 4 is STYLE ONLY: do not replace source faces, gaze, expression or clothes with those in the example.\n` +
    `Retain blue studio backgrounds, very large faces, a curved red arrow outlined black pointing from interviewee toward circle, soft black bottom gradient and subtle dark edge vignette.\n` +
    `Exact text, two lines, huge white Luckiest Guy-like letters with thick black outline and shadow:\n${text}\n` +
    (example.quotationMarks ? 'Render exactly ONE visible opening curly double quotation mark before the first word on line 1 and ONE visible closing curly double quotation mark after the last word on line 2. These quotation marks are required printed glyphs, not prompt delimiters. Leave safe margins for both.\n' : '') +
    `Remove broadcast logos, clock, phone numbers and lower thirds. No other text or invented expressions. Preserve all three identities and the actual new portrait's clothes. Do not copy the approved image as the output.\n`;
  const request = { caseId: example.id, outputDirectory: output, videoUrl: example.videoUrl, localVideo: video, frames,
    portrait: { ...example.portrait, path: portrait, providedLocally: options.has('--portrait') },
    inputImages: [frames.interviewee.path, frames.presenter.path, portrait, golden], expectedImage: golden,
    historicalPrompt: resolve(referenceDirectory, example.historicalPrompt), prompt,
    next: 'Inspeccionar las cuatro imágenes, generar un resultado nuevo con la herramienta integrada, guardarlo como generated-v1.png y completar review.json tras comparación visual.' };
  await save(join(output, 'request.json'), request);
  await writeFile(join(output, 'prompt.txt'), prompt);
  await copyFile(join(referenceDirectory, 'review-template.json'), join(output, 'review.json'));
  console.log(JSON.stringify({ request: join(output, 'request.json'), review: join(output, 'review.json'), expected: golden }, null, 2));
}
