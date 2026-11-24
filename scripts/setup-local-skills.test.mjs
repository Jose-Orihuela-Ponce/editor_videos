import { afterAll, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { setupSkills } from './setup-local-skills.mjs';

const base = resolve('.local/portability-tests');
await mkdir(base, { recursive: true });
const root = await mkdtemp(join(base, 'skills-'));
afterAll(async () => {
  if (!root.startsWith(base + sep)) throw new Error('Ruta de limpieza fuera de las pruebas.');
  await rm(root, { recursive: true, force: true });
});
async function fixture(name) {
  const directory = join(root, name);
  for (const skill of ['crear-miniaturas', 'corregir-textos']) {
    await mkdir(join(directory, 'skills', skill), { recursive: true });
    await writeFile(join(directory, 'skills', skill, 'SKILL.md'), 'original');
  }
  return directory;
}

it('instala desde un clon sin depender del perfil personal y detecta una actualización', async () => {
  const directory = await fixture('fresh');
  expect((await setupSkills(directory, { check: true })).synchronized).toBe(false);
  await setupSkills(directory);
  expect((await setupSkills(directory, { check: true })).synchronized).toBe(true);
  await writeFile(join(directory, 'skills', 'crear-miniaturas', 'SKILL.md'), 'actualización');
  expect((await setupSkills(directory, { check: true })).synchronized).toBe(false);
  await setupSkills(directory);
  expect(await readFile(join(directory, '.agents', 'skills', 'crear-miniaturas', 'SKILL.md'), 'utf8')).toBe('actualización');
});

it('conserva una modificación local en lugar de reemplazarla después de pull', async () => {
  const directory = await fixture('local-edit');
  await setupSkills(directory);
  const target = join(directory, '.agents', 'skills', 'crear-miniaturas', 'SKILL.md');
  await writeFile(target, 'edición propia');
  await writeFile(join(directory, 'skills', 'crear-miniaturas', 'SKILL.md'), 'cambio remoto');
  await expect(setupSkills(directory)).rejects.toThrow('cambios propios');
  expect(await readFile(target, 'utf8')).toBe('edición propia');
});

it('no adopta ni sobrescribe una skill preexistente diferente sin registro', async () => {
  const directory = await fixture('existing');
  const target = join(directory, '.agents', 'skills', 'corregir-textos', 'SKILL.md');
  await mkdir(join(directory, '.agents', 'skills', 'corregir-textos'), { recursive: true });
  await writeFile(target, 'personal');
  await expect(setupSkills(directory)).rejects.toThrow('cambios propios');
  expect(await readFile(target, 'utf8')).toBe('personal');
  expect((await readFile(join(directory, 'skills', 'crear-miniaturas', 'SKILL.md'), 'utf8'))).toBe('original');
});
