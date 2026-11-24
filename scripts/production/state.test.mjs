import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readJson } from './state.mjs';

vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal(), readFile: vi.fn(),
}));
afterEach(() => { readFile.mockReset(); vi.useRealTimers(); });

it.each(['EBUSY', 'EACCES', 'EPERM'])('recupera el progreso tras un bloqueo transitorio %s', async code => {
  vi.useFakeTimers();
  readFile.mockRejectedValueOnce(Object.assign(new Error('Bloqueado'), { code }))
    .mockResolvedValueOnce('{"state":"running","percent":55}');
  const result = expect(readJson('status.json')).resolves.toEqual({ state: 'running', percent: 55 });
  await vi.runAllTimersAsync();
  await result;
});

it('mantiene el resultado ausente como pendiente, sin simular finalización', async () => {
  readFile.mockRejectedValue(Object.assign(new Error('Ausente'), { code: 'ENOENT' }));
  expect(await readJson('result.json')).toBeNull();
  expect(await readJson('drive.json', {})).toEqual({});
});

it('propaga datos corruptos sin ocultarlos como estado pendiente', async () => {
  readFile.mockResolvedValue('{');
  await expect(readJson('result.json')).rejects.toBeInstanceOf(SyntaxError);
});

it('termina con error si el bloqueo persiste', async () => {
  vi.useFakeTimers();
  const error = Object.assign(new Error('Bloqueado'), { code: 'EBUSY' });
  readFile.mockRejectedValue(error);
  const result = expect(readJson('status.json')).rejects.toBe(error);
  await vi.runAllTimersAsync();
  await result;
});
