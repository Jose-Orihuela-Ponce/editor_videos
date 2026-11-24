import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, stat, unlink, rmdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { loadEnvFile } from 'node:process';
import { deliverToDrive, referenceName } from './production/delivery.mjs';
import { saveJson, readJson as optionalJson } from './production/state.mjs';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const help = `Procesar un enlace con el motor de Editor.

node scripts/process-link.mjs --list-styles [--orientation horizontal|vertical]
node scripts/process-link.mjs --paths
node scripts/process-link.mjs --url ENLACE --style NOMBRE_O_ID --reference NOMBRE_CORTO [opciones]
node scripts/process-link.mjs --cancel CARPETA_DEL_TRABAJO

Opciones
  --reference NOMBRE_CORTO            Referencia para la carpeta de esta edición en Drive.
  --orientation horizontal|vertical  Horizontal por defecto.
  --quality 1080|720                 Calidad de descarga. 1080 por defecto.
  --output CARPETA                   Carpeta de exportación.
  --data-dir CARPETA                 Carpeta con tus estilos y proyectos.
  --downloads-dir CARPETA            Carpeta para conservar los originales.
  --executable RUTA                  Ejecutable actualizado de Editor.
  --cpu                              Exportar sin aceleración por hardware.

El progreso y la carpeta del trabajo se escriben en stderr.
El resultado final se escribe como JSON en stdout y en result.json.
Ctrl+C solicita cancelación y espera la limpieza del trabajo.
`;

async function readLocations(executable, storageArgs) {
  const temporary = await mkdtemp(join(tmpdir(), 'Editor-production-'));
  const path = join(temporary, 'paths.json');
  try {
    await new Promise((done, fail) => {
      const child = spawn(executable, ['--production-paths', path, ...storageArgs], { windowsHide: true, stdio: 'ignore' });
      const timeout = setTimeout(() => {
        child.kill();
        fail(new Error('El ejecutable no reconoce la entrada de producción. Usa la compilación actualizada de Editor.'));
      }, 30000);
      child.once('error', error => { clearTimeout(timeout); fail(error); });
      child.once('exit', code => {
        clearTimeout(timeout);
        if (code === 0) done();
        else fail(new Error('No se pudieron consultar las carpetas del editor.'));
      });
    });
    const locations = await optionalJson(path);
    if (!locations?.jobsDir || !locations.exportsDir) throw new Error('El ejecutable no devolvió las carpetas del editor.');
    return locations;
  } finally {
    await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(temporary);
  }
}

async function main() {
  const values = new Map();
  const flags = new Set(['--help', '--list-styles', '--paths', '--cpu']);
  const options = new Set(['--url', '--style', '--reference', '--orientation', '--quality', '--output', '--data-dir', '--downloads-dir', '--executable', '--cancel']);
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (values.has(key)) throw new Error('Opción repetida ' + key);
    if (flags.has(key)) values.set(key, true);
    else if (options.has(key) && index + 1 < args.length && !args[index + 1].startsWith('--')) values.set(key, args[++index]);
    else throw new Error('Opción desconocida o sin valor ' + key);
  }
  if (values.has('--help')) { process.stdout.write(help); return; }
  if (values.has('--cancel')) {
    const root = resolve(values.get('--cancel'));
    const request = await optionalJson(join(root, 'request.json'));
    if (!request?.jobId) throw new Error('No se encontró el trabajo indicado.');
    if (await optionalJson(join(root, 'result.json'))) throw new Error('El trabajo ya terminó.');
    await writeFile(join(root, 'cancel'), '', { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    process.stdout.write(JSON.stringify({ state: 'cancelling', jobId: request.jobId }) + '\n');
    return;
  }
  const orientation = values.get('--orientation') ?? 'horizontal';
  const quality = values.get('--quality') ?? '1080';
  if (!['horizontal', 'vertical'].includes(orientation)) throw new Error('Orientación no válida.');
  if (!['1080', '720'].includes(quality)) throw new Error('Calidad no válida.');
  if (!values.has('--list-styles') && !values.has('--paths') && (!values.get('--url') || !values.get('--style')?.trim())) {
    throw new Error('Indica --url y --style. Consulta los estilos con --list-styles.');
  }
  const reference = values.has('--list-styles') || values.has('--paths') ? null : referenceName(values.get('--reference'));
  let executable = values.get('--executable');
  if (!executable) {
    for (const candidate of ['editor-video-ligero-automatico.exe', 'editor-video-ligero.exe']) {
      const path = join(workspace, 'src-tauri', 'target', 'release', candidate);
      if (await stat(path).then(info => info.isFile()).catch(() => false)) { executable = path; break; }
    }
  }
  if (!executable) throw new Error('No se encontró Editor. Compila la aplicación o indica --executable.');
  executable = resolve(executable);
  const storageArgs = [];
  for (const key of ['--data-dir', '--downloads-dir']) {
    if (values.has(key)) storageArgs.push(key, resolve(values.get(key)));
  }
  const locations = await readLocations(executable, storageArgs);
  if (values.has('--paths')) {
    process.stdout.write(JSON.stringify(locations) + '\n');
    return;
  }
  const jobId = randomUUID();
  const root = join(locations.jobsDir, jobId);
  await mkdir(root, { recursive: true });
  if (reference) await saveJson(join(root, 'production.json'), { reference, dataDir: locations.dataDir, jobId });
  const request = {
    jobId, action: values.has('--list-styles') ? 'styles' : 'process',
    url: values.get('--url') ?? '', style: values.get('--style') ?? '',
    orientation, quality, name: '',
    folder: values.has('--output') ? resolve(values.get('--output')) : locations.exportsDir,
    hardware: !values.has('--cpu'),
  };
  const requestPath = join(root, 'request.json');
  await writeFile(requestPath, JSON.stringify(request, null, 2), { flag: 'wx' });
  const launchArgs = ['--automatic-job', requestPath, ...storageArgs];
  process.stderr.write('Trabajo ' + root + '\n');
  const child = spawn(executable, launchArgs, { windowsHide: true, stdio: 'ignore' });
  let exited = false;
  let launchError;
  child.on('error', error => { launchError = error; exited = true; });
  child.on('exit', () => { exited = true; });
  const controller = new AbortController();
  const cancel = () => {
    controller.abort();
    void writeFile(join(root, 'cancel'), '', { flag: 'wx' }).catch(error => {
      if (error.code !== 'EEXIST') process.stderr.write(String(error) + '\n');
    });
  };
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  let lastProgress = '';
  let started = false;
  const launchedAt = Date.now();
  try {
    for (;;) {
      const result = await optionalJson(join(root, 'result.json'));
      if (result) {
        let drive;
        if (reference && result.state === 'completed') {
          try { loadEnvFile(join(workspace, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
          drive = await deliverToDrive(root, { signal: controller.signal, report: (stage, percent) => process.stderr.write(stage + ' · ' + percent + ' %\n') });
        }
        process.stdout.write(JSON.stringify({ ...result, reference, drive, jobDirectory: root }) + '\n');
        process.exitCode = result.state === 'completed' ? (drive?.state === 'failed' ? 1 : drive?.state === 'cancelled' ? 2 : 0) : result.state === 'cancelled' ? 2 : 1;
        return;
      }
      if (exited) throw launchError ?? new Error('El motor se cerró sin completar el trabajo. Revisa que el ejecutable incluya el procesamiento por comando.');
      const status = await optionalJson(join(root, 'status.json'));
      if (status) {
        started = true;
        const progress = status.stage + ' · ' + Math.floor(status.percent) + ' %';
        if (progress !== lastProgress) { process.stderr.write(progress + '\n'); lastProgress = progress; }
      }
      if (!started && Date.now() - launchedAt > 45000) {
        child.kill();
        throw new Error('El ejecutable no inició el trabajo. Usa la compilación actualizada de Editor.');
      }
      await new Promise(done => setTimeout(done, 500));
    }
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}

main().catch(error => {
  process.stderr.write(String(error) + '\n');
  process.exitCode = 1;
});
