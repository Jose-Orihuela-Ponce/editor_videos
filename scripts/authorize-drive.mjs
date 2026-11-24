import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--credentials') {
  throw new Error('Uso: node scripts/authorize-drive.mjs --credentials RUTA_JSON');
}
const data = JSON.parse(await readFile(resolve(args[1]), 'utf8'));
const client = data.installed;
if (!client?.client_id || !client?.client_secret) throw new Error('Se requiere el JSON de un cliente de escritorio.');
const envPath = resolve(root, '.env');
async function save(values) {
  let content;
  try { content = await readFile(envPath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; content = ''; }
  for (const [key, value] of Object.entries(values)) {
    if (/[\r\n]/.test(value)) throw new Error('Valor de credencial inválido.');
    const line = key + '=' + JSON.stringify(value);
    const pattern = new RegExp('^' + key + '=.*$', 'm');
    content = pattern.test(content) ? content.replace(pattern, () => line) : content.trimEnd() + '\n' + line + '\n';
  }
  await writeFile(envPath, content, { mode: 0o600 });
}
await save({ GOOGLE_DRIVE_CLIENT_ID: client.client_id, GOOGLE_DRIVE_CLIENT_SECRET: client.client_secret });
console.log('Cliente de escritorio importado en .env. Sus valores no se muestran.');
const state = randomBytes(32).toString('base64url');
const verifier = randomBytes(48).toString('base64url');
let consumed = false;
let redirect;
const server = createServer(async (request, response) => {
  const url = new URL(request.url, redirect);
  if (url.pathname !== '/oauth2callback') { response.writeHead(404).end(); return; }
  if (url.searchParams.get('state') !== state || consumed) { response.writeHead(400).end('Solicitud no válida.'); return; }
  consumed = true;
  try {
    if (url.searchParams.has('error')) throw new Error('Autorización denegada por Google o por el usuario.');
    const authCode = url.searchParams.get('code');
    if (!authCode) throw new Error('Google no devolvió el código de autorización.');
    const result = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: authCode, client_id: client.client_id,
        client_secret: client.client_secret, redirect_uri: redirect,
        grant_type: 'authorization_code', code_verifier: verifier }),
      signal: AbortSignal.timeout(30000),
    });
    const tokens = await result.json();
    if (!result.ok || !tokens.refresh_token) throw new Error('No se obtuvo el refresh token. Repite la autorización y concede el acceso solicitado.');
    await save({ GOOGLE_DRIVE_REFRESH_TOKEN: tokens.refresh_token });
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Drive autorizado. Puedes cerrar esta pestaña y volver al chat.');
    console.log('Autorización completada. Refresh token guardado en .env sin mostrarlo.');
  } catch (error) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No se completó la autorización. Vuelve al chat.');
    console.error(error.message);
    process.exitCode = 1;
  } finally { clearTimeout(timeout); server.close(); }
});
await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
redirect = 'http://127.0.0.1:' + server.address().port + '/oauth2callback';
const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
auth.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirect,
  response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file',
  access_type: 'offline', prompt: 'consent', state,
  code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  code_challenge_method: 'S256' }).toString();
console.log('Abre este enlace EN ESTA COMPUTADORA y autoriza tu cuenta:');
console.log(auth.href);
const timeout = setTimeout(() => { console.error('Autorización pendiente: tiempo agotado. Puedes ejecutar el comando otra vez.'); server.close(); process.exitCode = 1; }, 15 * 60 * 1000);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearTimeout(timeout); server.close(); });
