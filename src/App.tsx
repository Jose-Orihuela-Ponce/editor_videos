import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Clapperboard, Clock3, FolderOpen, HardDrive, LayoutGrid, Monitor, Plus, Smartphone, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api, desktop } from './core/api';
import type { Library, Orientation, RecentProject, ToolStatus } from './core/project';
import { hasUnsavedChanges, useProjectStore } from './core/store';
import { useSession } from './core/session';
import Editor from './components/Editor';
import { usePresets } from './core/presets';
import Modal from './components/Modal';

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="brand-icon"><Clapperboard size={20} strokeWidth={2.2} /></span>{!compact && <span>editor<span className="brand-dot">.</span></span>}</div>;
}
function FormatArt({ orientation, small = false }: { orientation: Orientation; small?: boolean }) {
  return <div className={`format-art ${orientation} ${small ? 'small' : ''}`} aria-hidden="true">
    <span className="art-grid" /><div className="art-frame"><span className="art-sun" /><span className="art-hill back" /><span className="art-hill front" /><span className="art-corner tl" /><span className="art-corner br" /></div>
    {!small && <><span className="art-dot one" /><span className="art-dot two" /><span className="aspect-tag">{orientation === 'horizontal' ? '16:9' : '9:16'}</span></>}
  </div>;
}

export default function App() {
  const project = useProjectStore(s => s.project);
  const filePath = useProjectStore(s => s.filePath);
  const dirty = useProjectStore(s => hasUnsavedChanges(s));
  const [library, setLibrary] = useState<Library>({ baseDir: '', projects: [], warnings: [] });
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');
  const [newOrientation, setNewOrientation] = useState<Orientation | null>(null);
  const [newName, setNewName] = useState('Mi video');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);

  const refreshLibrary = useCallback(async () => {
    try { setLibrary(await api.library()); setLibraryError(''); }
    catch (error) { setLibraryError(String(error)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refreshLibrary(); void usePresets.getState().load().catch(error => notify(String(error), true)); void api.tools().then(setTools).catch(() => setTools([])); }, [refreshLibrary, notify]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const requestLeave = useCallback((action: () => void) => {
    if (hasUnsavedChanges()) setPendingAction(() => action); else action();
  }, []);
  const saveProject = useCallback(async (): Promise<boolean> => {
    const state = useProjectStore.getState();
    if (!state.project || savingRef.current) return false;
    if (!desktop) { notify('Para guardar en tu equipo, abre la aplicación de escritorio.', true); return false; }
    const source = state.project;
    savingRef.current = true; setSaving(true);
    try {
      const document = await api.save(source, state.filePath);
      useProjectStore.getState().markSaved(document, source);
      void refreshLibrary(); notify('Proyecto guardado en tu equipo.');
      return true;
    } catch (error) { notify(String(error), true); return false; }
    finally { savingRef.current = false; setSaving(false); }
  }, [notify, refreshLibrary]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void saveProject(); return; }
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? useProjectStore.getState().redo() : useProjectStore.getState().undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveProject]);
  useEffect(() => {
    if (!desktop) {
      const beforeUnload = (event: BeforeUnloadEvent) => { if (hasUnsavedChanges()) event.preventDefault(); };
      window.addEventListener('beforeunload', beforeUnload);
      return () => window.removeEventListener('beforeunload', beforeUnload);
    }
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(event => {
      if (useSession.getState().exporting) { event.preventDefault(); notify('Cancela la exportación antes de cerrar el editor.', true); return; }
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      requestLeave(() => { void getCurrentWindow().destroy(); });
    }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(error => notify(String(error), true));
    return () => { disposed = true; unlisten?.(); };
  }, [notify, requestLeave]);

  async function createProject(event: FormEvent) {
    event.preventDefault(); if (!newOrientation || !newName.trim() || busy) return;
    setBusy(true);
    try { useProjectStore.getState().load(await api.create(newName, newOrientation)); setNewOrientation(null); }
    catch (error) { notify(String(error), true); }
    finally { setBusy(false); }
  }
  async function openProject(filePath: string) {
    setBusy(true);
    try {
      const document = await api.open(filePath);
      useProjectStore.getState().load(document.project, document.filePath, document.recovered);
      if (document.recovered) notify('Se abrió la copia de respaldo. Guarda para recuperar el archivo principal.', true);
    } catch (error) { notify(String(error), true); }
    finally { setBusy(false); }
  }
  async function chooseProject() {
    try { const chosen = await api.chooseProject(); if (typeof chosen === 'string') requestLeave(() => { void openProject(chosen); }); }
    catch (error) { notify(error instanceof Error ? error.message : String(error), true); }
  }
  const toolsReady = tools.length === 2 && tools.every(tool => tool.available);
  const engineLabel = !desktop ? 'Vista web · sin acceso al disco' : !tools.length ? 'Comprobando motor…' : toolsReady ? 'Motor de video listo' : 'Revisa el motor de video';
  const engineStatus = <span className={`engine-status ${toolsReady ? 'ready' : ''}`} title={tools.map(tool => tool.version).join('\n')}><span />{engineLabel}</span>;

  return <div className="app-shell">
    {!desktop && <div className="preview-banner">Vista previa de la interfaz. El guardado y la apertura funcionan en la aplicación de escritorio.</div>}
    {!project ? <div className="home-layout">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">TU ESPACIO</div>
        <div className="nav-item active"><LayoutGrid size={18} /><span>Mis proyectos</span><span className="count">{library.projects.length}</span></div>
        <div className="sidebar-bottom"><div className="local-symbol"><HardDrive size={19} /></div><strong>Todo queda contigo</strong><p>Tus proyectos y archivos,<br />en tu propio equipo.</p><span className="local-pill"><span />100% local</span></div>
        <div className="sidebar-version">EDITOR <span>v0.1</span></div>
      </aside>
      <main className="home-main">
        <div className="section-label home-actions"><span>NUEVO PROYECTO</span><button className="secondary-button" onClick={() => void chooseProject()} disabled={busy}><FolderOpen size={17} />Abrir proyecto</button></div>
        <section className="format-cards" aria-label="Crear un proyecto">
          {(['horizontal', 'vertical'] as Orientation[]).map(orientation => <button key={orientation} className={`format-card ${orientation}`} onClick={() => { setNewName('Mi video'); setNewOrientation(orientation); }} disabled={busy}>
            <FormatArt orientation={orientation} />
            <div className="format-card-content"><div><div className="format-card-title">Proyecto {orientation}<span className="new-arrow"><ArrowRight size={17} /></span></div><p>{orientation === 'horizontal' ? 'Para historias que necesitan espacio.' : 'Para historias que van contigo.'}</p><span className="format-spec">{orientation === 'horizontal' ? '1920 × 1080' : '1080 × 1920'}<span>·</span>{orientation === 'horizontal' ? '16:9' : '9:16'}</span></div></div>
          </button>)}
        </section>
        <section className="recent-section"><div className="recent-heading"><h2>Proyectos recientes <span>{library.projects.length}</span></h2><span>Continúa donde lo dejaste</span></div>
          {loading ? <div className="empty-recent"><span className="loading-ring" /><p>Buscando tus proyectos…</p></div> : libraryError ? <div className="empty-recent error-state"><p>{libraryError}</p><button className="secondary-button" onClick={() => void refreshLibrary()}>Reintentar</button></div> : library.projects.length ? <div className="recent-grid">{library.projects.map(recent => <RecentCard key={recent.filePath} project={recent} disabled={busy} onOpen={() => void openProject(recent.filePath)} />)}</div> : <div className="empty-recent"><div className="empty-icon"><FolderOpen size={28} strokeWidth={1.3} /><span><Plus size={11} /></span></div><h3>Un buen comienzo está en blanco.</h3><p>Crea tu primer proyecto. Lo encontrarás aquí cuando lo guardes.</p></div>}
          {library.warnings.length > 0 && <p className="library-warning">{library.warnings.join(' ')}</p>}
        </section>
        <footer className="home-footer">{engineStatus}<span title={library.baseDir}><HardDrive size={13} />{library.baseDir || 'Archivos en tu equipo'}</span></footer>
      </main>
    </div> : <Editor project={project} saving={saving} onBack={() => requestLeave(() => useProjectStore.getState().clear())} onSave={() => void saveProject()} onNotice={notify} engineStatus={engineStatus} filePath={filePath} />}
    {newOrientation && <Modal title="Nuevo proyecto" onClose={() => { if (!busy) setNewOrientation(null); }}><form onSubmit={event => void createProject(event)}><div className="new-project-format"><span>{newOrientation === 'horizontal' ? <Monitor size={24} /> : <Smartphone size={24} />}</span><div><strong>{newOrientation === 'horizontal' ? 'Horizontal · 16:9' : 'Vertical · 9:16'}</strong><p>{newOrientation === 'horizontal' ? '1920 × 1080' : '1080 × 1920'} · Lienzo en blanco</p></div></div><label className="field-label" htmlFor="new-project-name">Nombre del proyecto</label><input id="new-project-name" className="text-input" value={newName} maxLength={120} onChange={event => setNewName(event.target.value)} autoFocus onFocus={event => event.target.select()} /><p className="modal-note">Se creará la carpeta cuando guardes por primera vez.</p><div className="modal-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setNewOrientation(null)}>Cancelar</button><button type="submit" className="primary-button" disabled={!newName.trim() || busy}>{busy ? 'Creando…' : 'Crear proyecto'}<ArrowRight size={16} /></button></div></form></Modal>}
    {pendingAction && <Modal title="Tienes cambios sin guardar" onClose={() => setPendingAction(null)}><p className="unsaved-message">Guarda tu proyecto para continuar después con los mismos ajustes.</p><div className="modal-actions wrap"><button className="text-button" disabled={saving} onClick={() => { const action = pendingAction; setPendingAction(null); action(); }}>Salir sin guardar</button><button className="secondary-button" disabled={saving} onClick={() => setPendingAction(null)}>Cancelar</button>{desktop && <button className="primary-button" disabled={saving} onClick={async () => { if (await saveProject()) { if (!hasUnsavedChanges()) { const action = pendingAction; setPendingAction(null); action(); } else notify('Hay cambios nuevos. Guarda de nuevo para salir.'); } }}>{saving ? 'Guardando…' : 'Guardar y salir'}</button>}</div></Modal>}
    {notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><CheckCircle2 size={18} /><span>{notice.text}</span><button className="icon-button" onClick={() => setNotice(null)} aria-label="Cerrar aviso"><X size={16} /></button></div>}
  </div>;
}

function RecentCard({ project, onOpen, disabled }: { project: RecentProject; onOpen: () => void; disabled: boolean }) {
  const date = new Date(project.updatedAt);
  return <button className="recent-card" onClick={onOpen} disabled={disabled}><FormatArt orientation={project.orientation} small /><div><h3>{project.name}</h3><span><Clock3 size={12} />{date.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}<span>·</span>{project.orientation === 'horizontal' ? '16:9' : '9:16'}</span></div><ArrowRight size={16} /></button>;
}
