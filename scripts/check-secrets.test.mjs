import { afterAll, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

const script = resolve('scripts/check-secrets.mjs');
const base = resolve('.local/secret-check-tests');
mkdirSync(base, { recursive: true });
const root = mkdtempSync(join(base, 'run-'));
afterAll(() => {
  if (!root.startsWith(base + sep)) throw new Error('La limpieza debe quedar dentro de las pruebas.');
  rmSync(root, { recursive: true, force: true });
});

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Falló la preparación del repositorio de prueba.');
}
function fixture() {
  const cwd = join(root, randomUUID());
  mkdirSync(cwd);
  git(cwd, 'init', '--quiet');
  writeFileSync(join(cwd, '.gitignore'), '.env\n');
  writeFileSync(join(cwd, 'README.md'), 'Repositorio de prueba.\n');
  git(cwd, 'add', '.');
  commit(cwd);
  return cwd;
}
function commit(cwd) {
  git(cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '--quiet', '--no-verify', '-m', 'fixture');
}
function scan(cwd, ...args) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GOOGLE_DRIVE_')) delete env[key];
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8' });
  return { status: result.status, output: result.stdout + result.stderr };
}
function syntheticToken() { return ['GOCSPX', randomUUID().replaceAll('-', '')].join('-'); }

it('permite la configuración local ignorada y una plantilla vacía', () => {
  const cwd = fixture();
  const secret = syntheticToken();
  writeFileSync(join(cwd, '.env'), 'GOOGLE_DRIVE_CLIENT_SECRET=' + secret);
  writeFileSync(join(cwd, '.env.example'), '# Completar localmente\nGOOGLE_DRIVE_CLIENT_SECRET=\n');
  const result = scan(cwd, '--history');
  expect(result.status).toBe(0);
  expect(result.output).not.toContain(secret);
});

it('detecta una copia de un valor local incluso dentro de un binario sin mostrarlo', () => {
  const cwd = fixture();
  const secret = 'local-' + randomUUID();
  writeFileSync(join(cwd, '.env'), 'GOOGLE_DRIVE_REFRESH_TOKEN=' + secret);
  writeFileSync(join(cwd, 'image.bin'), Buffer.concat([Buffer.from([0, 1]), Buffer.from(secret)]));
  const result = scan(cwd);
  expect(result.status).toBe(1);
  expect(result.output).toContain('valor de credencial local');
  expect(result.output).not.toContain(secret);
});

it('revisa lo preparado en el índice aunque la copia de trabajo ya esté limpia', () => {
  const cwd = fixture();
  const secret = syntheticToken();
  writeFileSync(join(cwd, 'notes.txt'), secret);
  git(cwd, 'add', 'notes.txt');
  writeFileSync(join(cwd, 'notes.txt'), 'Limpio');
  const result = scan(cwd);
  expect(result.status).toBe(1);
  expect(result.output).toContain('Índice');
  expect(result.output).not.toContain(secret);
});

it('detecta un secreto borrado en un commit posterior', () => {
  const cwd = fixture();
  const secret = syntheticToken();
  writeFileSync(join(cwd, 'notes.txt'), secret);
  git(cwd, 'add', 'notes.txt');
  commit(cwd);
  git(cwd, 'rm', 'notes.txt');
  commit(cwd);
  expect(scan(cwd).status).toBe(0);
  const result = scan(cwd, '--history');
  expect(result.status).toBe(1);
  expect(result.output).toContain('Historial');
  expect(result.output).not.toContain(secret);
});

it('rechaza archivos privados forzados en el índice aunque estén vacíos', () => {
  const cwd = fixture();
  writeFileSync(join(cwd, '.env'), '');
  git(cwd, 'add', '--force', '.env');
  expect(scan(cwd).output).toContain('archivo privado');
  expect(scan(cwd).status).toBe(1);
});

it('detecta credenciales en mensajes de commit sin mostrarlas', () => {
  const cwd = fixture();
  const secret = syntheticToken();
  git(cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false',
    'commit', '--allow-empty', '--quiet', '--no-verify', '-m', secret);
  const result = scan(cwd, '--history');
  expect(result.status).toBe(1);
  expect(result.output).toContain('mensaje de commit');
  expect(result.output).not.toContain(secret);
});

it.each(['.codex-attachments/chat/photo.jpg', 'recording.MP4'])('rechaza material local añadido a la fuerza: %s', path => {
  const cwd = fixture();
  writeFileSync(join(cwd, '.gitignore'), '.env\n.codex-attachments/\n*.MP4\n');
  mkdirSync(resolve(cwd, path, '..'), { recursive: true });
  writeFileSync(join(cwd, path), Buffer.from([0, 1, 2]));
  expect(scan(cwd).status).toBe(0);
  git(cwd, 'add', '--force', path);
  const result = scan(cwd);
  expect(result.status).toBe(1);
  expect(result.output).toContain(path.endsWith('.jpg') ? 'archivo privado' : 'medio completo excluido de Git');
  expect(result.output).toContain('Índice');
});

it('rechaza valores de ejemplo que puedan confundirse con configuración real', () => {
  const cwd = fixture();
  writeFileSync(join(cwd, '.env.example'), 'GOOGLE_DRIVE_CLIENT_ID=example\n');
  const result = scan(cwd);
  expect(result.status).toBe(1);
  expect(result.output).toContain('la plantilla debe tener valores vacíos');
});
