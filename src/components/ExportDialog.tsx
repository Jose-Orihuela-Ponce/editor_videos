import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { CheckCircle2, FolderOpen } from 'lucide-react';
import Modal from './Modal';
import { api } from '../core/api';
import { exportSize } from '../core/export';
import { prepareExport } from '../core/prepareExport';
import type { ExportOptions, ExportProgress } from '../core/export';
import type { Project } from '../core/project';
import { formatTime, projectDuration } from '../core/timeline';
import { useSession } from '../core/session';

export default function ExportDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [options, setOptions] = useState<ExportOptions>({ format: 'mp4', quality: 'original', hardware: true, name: project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'Mi video', folder: null });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [jobId, setJobId] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [defaultFolder, setDefaultFolder] = useState('');
  useEffect(() => {
    let active = true;
    void api.exportFolder().then(folder => { if (active) setDefaultFolder(folder); }).catch(error => { if (active) setError(String(error)); });
    return () => { active = false; };
  }, []);
  const size = exportSize(project, options.quality);
  async function run() {
    if (running) return;
    let unlisten: (() => void) | undefined;
    setError(''); setResult(''); setCancelling(false);
    try {
      const { snapshot, plan } = await prepareExport(project, options);
      const id = crypto.randomUUID(); setJobId(id); setRunning(true); useSession.setState({ exporting: true });
      setProgress({ jobId: id, percent: 0, stage: 'Preparando', encoder: '' });
      unlisten = await listen<ExportProgress>('export-progress', event => { if (event.payload.jobId === id) setProgress(event.payload); });
      const exported = await api.exportProject(snapshot, plan, options, id);
      if (exported.cancelled) setProgress({ jobId: id, percent: 0, stage: 'Exportación cancelada', encoder: '' });
      else { setResult(exported.path ?? ''); setProgress({ jobId: id, percent: 100, stage: 'Terminado', encoder: exported.encoder }); }
    } catch (error) { setError(String(error)); }
    finally { unlisten?.(); setRunning(false); setCancelling(false); useSession.setState({ exporting: false }); }
  }
  async function cancel() {
    setCancelling(true);
    try { await api.cancelExport(jobId); } catch (error) { setError(String(error)); setCancelling(false); }
  }
  return <Modal title="Exportar proyecto" onClose={onClose} locked={running}>
    <label className="field-label" htmlFor="export-name">Nombre del archivo</label><input id="export-name" className="text-input" disabled={running} maxLength={100} value={options.name} onChange={e => setOptions({ ...options, name: e.target.value })} />
    <div className="export-fields"><label className="field-label">Formato<select className="text-input" aria-label="Formato de exportación" disabled={running} value={options.format} onChange={e => setOptions({ ...options, format: e.target.value as ExportOptions['format'] })}><option value="mp4">MP4 · video y audio</option><option value="mp3">MP3 · solo audio</option></select></label><label className="field-label">Calidad<select className="text-input" aria-label="Calidad de exportación" disabled={running || options.format === 'mp3'} value={options.quality} onChange={e => setOptions({ ...options, quality: e.target.value as ExportOptions['quality'] })}><option value="original">Original</option><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option></select></label></div>
    <div className="export-summary"><span>{formatTime(projectDuration(project), true)}</span><span>{options.format === 'mp4' ? `${size.width} × ${size.height}` : 'Audio estéreo · 48 kHz'}</span><span>{options.format === 'mp4' ? `${Math.min(60, project.media.find(m => m.id === project.main[0]?.mediaId)?.fps || 30).toFixed(2)} fps` : 'MP3 · calidad alta'}</span></div>
    <label className="field-label">Carpeta</label><button className="export-folder secondary-button" disabled={running} title={options.folder ?? (defaultFolder || 'Consultando carpeta…')} onClick={async () => { try { const folder = await api.chooseFolder(); if (typeof folder === 'string') setOptions({ ...options, folder }); } catch (error) { setError(String(error)); } }}><FolderOpen size={16} /><span>{options.folder ?? (defaultFolder || 'Consultando carpeta…')}</span></button>
    <label className="check-option export-hardware"><input type="checkbox" disabled={running || options.format === 'mp3'} checked={options.hardware} onChange={e => setOptions({ ...options, hardware: e.target.checked })} /><span>Usar aceleración por hardware<small>Se comprueba al exportar. CPU si no está disponible.</small></span></label>
    {progress && <div className="export-progress"><div><span>{cancelling ? 'Cancelando…' : progress.stage}</span><strong>{Math.floor(progress.percent)} %</strong></div><progress max={100} value={progress.percent} />{progress.encoder && <small>{progress.encoder === 'libx264' ? 'H.264 · CPU' : progress.encoder}</small>}</div>}
    {result && <div className="export-success"><CheckCircle2 size={18} /><div><strong>Archivo creado</strong><p>{result}</p></div></div>}
    {error && <div className="inline-error" role="alert"><p>{error.split('\n')[0]}</p>{error.includes('\n') && <details><summary>Detalles</summary><pre>{error}</pre></details>}</div>}
    <p className="modal-note">Los originales se conservan. Si el nombre ya existe, se crea otra copia.</p>
    <div className="modal-actions">{running ? <button className="secondary-button" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? 'Cancelando…' : 'Cancelar exportación'}</button> : <><button className="secondary-button" onClick={onClose}>Cerrar</button><button className="primary-button" disabled={!options.name.trim()} onClick={() => void run()}>{result ? 'Exportar otra vez' : 'Exportar'}</button></>}</div>
  </Modal>;
}
