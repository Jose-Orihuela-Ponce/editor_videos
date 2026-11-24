import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { deliverToDrive } from './production/delivery.mjs';

async function main() {
  const options = new Map();
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (!['--job', '--thumbnail'].includes(args[i]) || !args[i + 1]) throw new Error('Usa --job CARPETA y, opcionalmente, --thumbnail IMAGEN.');
    options.set(args[i], args[++i]);
  }
  if (!options.has('--job')) throw new Error('Indica --job con la carpeta del trabajo terminado.');
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try { loadEnvFile(join(workspace, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    const result = await deliverToDrive(resolve(options.get('--job')), {
      thumbnail: options.has('--thumbnail') ? resolve(options.get('--thumbnail')) : undefined,
      signal: controller.signal,
      report: (stage, percent) => process.stderr.write(stage + ' · ' + percent + ' %\n'),
    });
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.state === 'verified' ? 0 : result.state === 'cancelled' ? 2 : 1;
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}
main().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
