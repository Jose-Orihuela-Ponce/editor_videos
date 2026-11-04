import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { listen } from '@tauri-apps/api/event';
import { FolderOpen, Zap } from 'lucide-react';
import { api, desktop } from '../core/api';
import { automaticName, automaticProject } from '../core/automatic';
import type { AutomaticProgress, DownloadQuality } from '../core/automatic';
import type { ExportProgress } from '../core/export';
import type { Orientation, ToolStatus } from '../core/project';
import { prepareExport } from '../core/prepareExport';
import { useSession } from '../core/session';

const preferencesKey = 'editor.automatic.v1';
function preferences(): { orientation: Orientation; quality: DownloadQuality; folder: string | null } {
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey) || '{}');
    return { orientation: saved.orientation === 'vertical' ? 'vertical' : 'horizontal', quality: saved.quality === '720' ? '720' : '1080', folder: typeof saved.folder === 'string' && saved.folder ? saved.folder : null };
  } catch { return { orientation: 'horizontal', quality: '1080', folder: null }; }
}

export default function AutomaticMode({ onBusy }: { onBusy: (value: boolean) => void }) {
  const [settings, setSettings] = useState(preferences);
  const [url, setUrl] = useState('');
  const [defaultFolder, setDefaultFolder] = useState('');
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [styleReady, setStyleReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<AutomaticProgress | null>(null);
  const [result, setResult] = useState('');
  const [originalFolder, setOriginalFolder] = useState('');
  const [error, setError] = useState('');
  const active = useRef(false);
  const cancelled = useRef(false);
  const jobId = useRef('');
  useEffect(() => { try { localStorage.setItem(preferencesKey, JSON.stringify(settings)); } catch { /* Preferences are optional. */ } }, [settings]);
  useEffect(() => {
    let current = true;
    setChecking(true); setStyleReady(false); setError('');
    if (!desktop) { setChecking(false); return; }
    void Promise.all([api.automaticTools(), api.loadPreset(settings.orientation), api.exportFolder()]).then(([tools, preset, folder]) => {
      if (current) { setTools(tools); setStyleReady(!!preset.clip); setDefaultFolder(folder); }
    }).catch(error => { if (current) setError(String(error)); }).finally(() => { if (current) setChecking(false); });
    return () => { current = false; };
  }, [settings.orientation]);

  async function run(event: FormEvent) {
    event.preventDefault();
    if (active.current || !desktop) return;
    active.current = true; cancelled.current = false;
    const id = crypto.randomUUID(); jobId.current = id;
    setRunning(true); onBusy(true); useSession.setState({ exporting: true });
    setError(''); setResult(''); setOriginalFolder(''); setCancelling(false);
    setProgress({ jobId: id, percent: 0, stage: 'Preparando descarga' });
    const stops: (() => void)[] = [];
    try {
      const preset = structuredClone(await api.loadPreset(settings.orientation));
      if (!preset.clip) throw new Error(`Guarda primero un estilo ${settings.orientation} en el editor manual.`);
      stops.push(await listen<AutomaticProgress>('automatic-progress', event => { if (event.payload.jobId === id) setProgress(event.payload); }));
      stops.push(await listen<ExportProgress>('export-progress', event => { if (event.payload.jobId === id) setProgress(event.payload); }));
      if (cancelled.current) return;
      const download = await api.downloadYoutube(url.trim(), settings.quality, id);
      if (download.cancelled || cancelled.current) return;
      if (!download.media) throw new Error('No se recibió el video descargado.');
      setOriginalFolder(download.folder);
      setProgress({ jobId: id, percent: 0, stage: 'Aplicando estilo y preparando textos' });
      const project = automaticProject(download.media, settings.orientation, preset, download.title);
      const options = { format: 'mp4' as const, quality: 'original' as const, hardware: true, name: automaticName(download.title), folder: settings.folder };
      const { snapshot, plan } = await prepareExport(project, options);
      if (cancelled.current) return;
      const exported = await api.exportProject(snapshot, plan, options, id);
      if (exported.cancelled) { cancelled.current = true; return; }
      cancelled.current = false; // A published file remains a success if cancellation arrived too late.
      setResult(exported.path || '');
      setProgress({ jobId: id, percent: 100, stage: 'Video editado y exportado' });
    } catch (error) {
      if (!cancelled.current) { setError(String(error)); setProgress({ jobId: id, percent: 0, stage: 'No se pudo completar el trabajo' }); }
    } finally {
      stops.forEach(stop => stop());
      if (cancelled.current) setProgress({ jobId: id, percent: 0, stage: 'Trabajo cancelado' });
      active.current = false; setRunning(false); setCancelling(false); onBusy(false); useSession.setState({ exporting: false });
    }
  }
  async function cancel() {
    cancelled.current = true; setCancelling(true);
    try { await api.cancelExport(jobId.current); }
    catch (error) { setError(String(error)); setCancelling(false); }
  }
  return <section className="automatic-mode" aria-labelledby="automatic-title">
    <div className="automatic-heading"><Zap size={25} /><h1 id="automatic-title">Modo automático</h1></div>
    <form onSubmit={event => void run(event)}>
      <fieldset disabled={running}>
        <label className="field-label" htmlFor="youtube-url">Enlace de YouTube</label>
        <input id="youtube-url" className="text-input" type="url" required value={url} placeholder="https://www.youtube.com/watch?v=…" onChange={event => setUrl(event.target.value)} />
        <div className="export-fields">
          <label className="field-label">Orientación<select className="text-input" value={settings.orientation} onChange={event => setSettings({ ...settings, orientation: event.target.value as Orientation })}><option value="horizontal">Horizontal · 16:9</option><option value="vertical">Vertical · 9:16</option></select></label>
          <label className="field-label">Calidad de descarga<select className="text-input" value={settings.quality} onChange={event => setSettings({ ...settings, quality: event.target.value as DownloadQuality })}><option value="1080">1080p · alternativa 720p</option><option value="720">720p</option></select></label>
        </div>
        <p className={`automatic-style ${styleReady ? 'ready' : ''}`} role="status">{checking ? 'Comprobando estilo…' : styleReady ? `Estilo ${settings.orientation} guardado ✓` : `Guarda primero un estilo ${settings.orientation} en el editor manual.`}</p>
        <label className="field-label">Carpeta de salida</label>
        <button type="button" className="export-folder secondary-button" disabled={!desktop} onClick={async () => {
          try { const folder = await api.chooseFolder(); if (typeof folder === 'string') setSettings({ ...settings, folder }); }
          catch (error) { setError(String(error)); }
        }}><FolderOpen size={16} /><span>{settings.folder || defaultFolder || 'Videos/ediciones'}</span></button>
      </fieldset>
      {!desktop && <p className="inline-error">Abre la aplicación de escritorio para descargar y procesar videos.</p>}
      {tools.filter(tool => !tool.available).map(tool => <p className="inline-error" key={tool.name}>{tool.version}</p>)}
      {progress && <div className="export-progress" role="status"><div><span>{cancelling ? 'Cancelando…' : progress.stage}</span><strong>{Math.floor(progress.percent)} %</strong></div><progress max={100} value={progress.percent} /></div>}
      {result && <div className="export-success"><div><strong>Video listo</strong><p>{result}</p><button type="button" className="secondary-button" onClick={() => void api.revealAutomatic(result).catch(error => setError(String(error)))}><FolderOpen size={16} />Mostrar en carpeta</button></div></div>}
      {originalFolder && <details className="modal-note"><summary>Original descargado</summary><p>{originalFolder}</p></details>}
      {error && <div className="inline-error" role="alert"><p>{error.split('\n')[0]}</p>{error.includes('\n') && <details><summary>Detalles</summary><pre>{error}</pre></details>}</div>}
      <div className="modal-actions">{running ? <button type="button" className="secondary-button" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? 'Cancelando…' : 'Cancelar'}</button> : <button className="primary-button" type="submit" disabled={!desktop || checking || !styleReady || !url.trim() || tools.length !== 2 || tools.some(tool => !tool.available)}><Zap size={16} />Procesar</button>}</div>
    </form>
  </section>;
}
