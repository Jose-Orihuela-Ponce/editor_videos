import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Clapperboard, Film, Image as ImageIcon, Layers2, Maximize, Minimize, Monitor, Music2, Pause, Play, Plus, Redo2, Save, SkipBack, SkipForward, Smartphone, Undo2 } from 'lucide-react';
import { api, desktop } from '../core/api';
import type { Project } from '../core/project';
import { hasUnsavedChanges, useProjectStore } from '../core/store';
import { selectClip, useSession } from '../core/session';
import { appendMedia, clipAt, clipDuration, deleteClip, fileName, formatTime, projectDuration, reorderClip, splitAt, trimClip } from '../core/timeline';
import { mediaUrl, PlaybackController } from '../core/playback';
import { updateClipSettings } from '../core/clipSettings';
import { relinkMedia } from '../core/relink';
import { ensureProxy, useProxies } from '../core/proxies';
import { addAudioLayer, addVisualLayer, defaultTextStyle, moveLayer, removeLayer, splitLayer, updateOverlay } from '../core/layers';
import { ClipTools, ClipToolButtons } from '../tools';
import LayerControls from '../tools/layers/LayerControls';
import { applyStyle, applyStyleToText, captureStyle, clipSettings, defaultClipSettings, usePresets } from '../core/presets';
import PreviewFrame from './PreviewFrame';
import LayerPreview from './LayerPreview';
import ExportDialog from './ExportDialog';
import Timeline from './Timeline';

interface Props { project: Project; saving: boolean; onBack: () => void; onSave: () => void; onNotice: (text: string, error?: boolean) => void; engineStatus: ReactNode; filePath: string | null }
export default function Editor({ project, saving, onBack, onSave, onNotice, engineStatus, filePath }: Props) {
  const past = useProjectStore(s => s.past), future = useProjectStore(s => s.future), dirty = useProjectStore(s => hasUnsavedChanges(s));
  const time = useSession(s => s.time), playing = useSession(s => s.playing), loading = useSession(s => s.loading), error = useSession(s => s.error), selectedId = useSession(s => s.selectedId);
  const presets = usePresets(s => s.presets), presetBusy = usePresets(s => s.busy), clipboard = usePresets(s => s.clipboard);
  const proxyWorking = useProxies(s => s.working);
  const exporting = useSession(s => s.exporting), fitGuide = useSession(s => s.fitGuide);
  const video = useRef<HTMLVideoElement>(null), playback = useRef<PlaybackController | null>(null), nameGroup = useRef('');
  const [missing, setMissing] = useState<string[]>([]);
  const [importing, setImporting] = useState(false), [exportOpen, setExportOpen] = useState(false);
  const [start, setStart] = useState('0');
  const [layerController, setLayerController] = useState<PlaybackController | null>(null);
  const [cropClipId, setCropClipId] = useState<string | null>(null);
  const previewPanel = useRef<HTMLElement>(null);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const arrowGroup = useRef<string | undefined>(undefined);
  const duration = projectDuration(project);
  const selected = project.main.find(c => c.id === selectedId);
  const cropEditing = !previewFullscreen && !!selected && cropClipId === selected.id;
  const fullscreenLabel = previewFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa';
  const selectedLayer = project.overlays.find(item => item.id === selectedId) ?? project.audio.find(item => item.id === selectedId);
  const visualRows = new Set([0, ...project.overlays.map(item => item.track ?? 0)]).size;
  const audioRows = new Set([0, ...project.audio.map(item => item.track ?? 0)]).size;
  const workspaceStyle = { '--timeline-height': `${Math.min(440, Math.max(242, 70 + (visualRows + audioRows + 1) * 49))}px` } as CSSProperties;
  useEffect(() => { usePresets.setState({ clipboard: null }); }, [project.id]);
  useEffect(() => { for (const m of project.media) if (m.kind === 'video' && (m.w ?? 0) * (m.h ?? 0) > 1920 * 1080) void ensureProxy(m); }, [project.media]);
  useEffect(() => {
    if (!video.current) return;
    const controller = new PlaybackController(video.current); playback.current = controller; setLayerController(controller);
    return () => { controller.dispose(); playback.current = null; };
  }, [project.id]);
  useEffect(() => {
    setStart(selected?.start.toFixed(3) ?? '0');
  }, [selected?.id, selected?.start]);
  useEffect(() => { if (selectedId && !project.main.some(c => c.id === selectedId) && !project.overlays.some(c => c.id === selectedId) && !project.audio.some(c => c.id === selectedId)) selectClip(null); }, [project.main, project.overlays, project.audio, selectedId]);
  useEffect(() => { setCropClipId(null); }, [selectedId, project.id]);
  useEffect(() => { if (playing) setCropClipId(null); }, [playing]);

  useEffect(() => {
    const updateFullscreen = () => setPreviewFullscreen(!!document.fullscreenElement && document.fullscreenElement === previewPanel.current);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  async function togglePreviewFullscreen() {
    const panel = previewPanel.current;
    if (!panel) return;
    try {
      if (document.fullscreenElement === panel) await document.exitFullscreen();
      else await panel.requestFullscreen();
    } catch {
      onNotice('No se pudo cambiar la pantalla completa.', true);
    }
  }

  const actions = useRef({ copy: () => {}, paste: () => {}, split: () => {}, remove: () => {}, nudge: (_key: string, _step: number) => {} });
  actions.current.copy = () => {
    const state = useProjectStore.getState().project, id = useSession.getState().selectedId;
    const clip = state?.main.find(c => c.id === id), text = state?.overlays.find(o => o.id === id && o.type === 'text');
    if (clip) usePresets.getState().copy({ kind: 'clip', value: clipSettings(clip) });
    else if (text?.style) usePresets.getState().copy({ kind: 'text', value: text.style });
    else { onNotice('Selecciona un clip o texto para copiar sus ajustes.', true); return; }
    onNotice('Ajustes copiados.');
  };
  actions.current.paste = () => {
    const id = useSession.getState().selectedId, copied = usePresets.getState().clipboard;
    const project = useProjectStore.getState().project;
    if (!id || !copied || (copied.kind === 'clip' ? !project?.main.some(c => c.id === id) : !project?.overlays.some(o => o.id === id && o.type === 'text'))) { onNotice('Selecciona un elemento del mismo tipo para pegar los ajustes.', true); return; }
    try { useProjectStore.getState().edit(p => { if (copied.kind === 'clip') updateClipSettings(p, id, copied.value); else updateOverlay(p, id, { style: copied.value }); }); onNotice('Ajustes pegados.'); }
    catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); }
  };
  async function savePreset() {
    const current = selected ?? (selectedLayer && 'type' in selectedLayer && selectedLayer.type === 'text' ? clipAt(project, useSession.getState().time) ?? clipAt(project, selectedLayer.start) : undefined);
    if (!current) { onNotice('Selecciona el video cuyo estilo quieres guardar.', true); return; }
    try { await usePresets.getState().saveStyle(project.orientation, captureStyle(project, current)); onNotice('Estilo guardado.'); }
    catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); }
  }
  function applyPreset() {
    const preset = presets[project.orientation];
    try {
      if (selected && preset.clip) useProjectStore.getState().edit(p => applyStyle(p, selected.id, preset));
      else if (selectedLayer && 'type' in selectedLayer && selectedLayer.type === 'text' && preset.texts?.length) useProjectStore.getState().edit(p => applyStyleToText(p, selectedLayer.id, preset.texts![0]));
      else if (selectedLayer && 'type' in selectedLayer && selectedLayer.type === 'text' && preset.text) useProjectStore.getState().edit(p => updateOverlay(p, selectedLayer.id, { style: preset.text! }));
      else { onNotice('Selecciona un video o texto y guarda primero un estilo para este formato.', true); return; }
      onNotice('Estilo aplicado.');
    } catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); }
  }
  function resetSettings() {
    try { if (selected) useProjectStore.getState().edit(p => updateClipSettings(p, selected.id, defaultClipSettings()));
      else if (selectedLayer && 'type' in selectedLayer && selectedLayer.type === 'text') useProjectStore.getState().edit(p => updateOverlay(p, selectedLayer.id, {style: defaultTextStyle()}));
    } catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); }
  }
  const presetActions = <div className="preset-actions"><div><button className="secondary-button" onClick={resetSettings}>Restablecer</button><button className="secondary-button" onClick={() => actions.current.copy()}>Copiar</button><button className="secondary-button" disabled={!clipboard} onClick={() => actions.current.paste()}>Pegar</button></div></div>;
  actions.current.nudge = (key, step) => {
    const state = useProjectStore.getState(), id = useSession.getState().selectedId;
    const clip = state.project?.main.find(c => c.id === id), overlay = state.project?.overlays.find(c => c.id === id); if (!clip && !overlay) return;
    arrowGroup.current ??= crypto.randomUUID();
    try { state.edit(p => {
      const item = clip ?? overlay!;
      const patch = { posX: item.posX + (key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0), posY: item.posY + (key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0) };
      if (clip) updateClipSettings(p, clip.id, patch); else updateOverlay(p, overlay!.id, patch);
    }, arrowGroup.current); }
    catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); }
  };
  actions.current.split = () => {
    const head = playback.current?.time ?? useSession.getState().time;
    let right: string | null = null;
    const id = useSession.getState().selectedId;
    useProjectStore.getState().edit(p => { right = id && (p.overlays.some(item => item.id === id) || p.audio.some(item => item.id === id)) ? splitLayer(p, id, head) : splitAt(p, head); });
    if (right) selectClip(right); else onNotice('Coloca el cabezal dentro de un clip para dividirlo.');
  };
  actions.current.remove = () => {
    const id = useSession.getState().selectedId; if (!id) return;
    useProjectStore.getState().edit(p => { if (p.main.some(item => item.id === id)) deleteClip(p, id); else removeLayer(p, id); }); selectClip(null);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.fullscreenElement && document.fullscreenElement === previewPanel.current) {
        if (event.key === 'Escape') {
          event.preventDefault();
          void document.exitFullscreen().catch(() => onNotice('No se pudo salir de pantalla completa.', true));
          return;
        }
        if (event.code !== 'Space' && event.key !== ',' && event.key !== '.') return;
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && !(event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]') && !document.querySelector('dialog[open]')) { if (event.key.toLowerCase() === 'c') { event.preventDefault(); actions.current.copy(); } else if (event.key.toLowerCase() === 'v') { event.preventDefault(); actions.current.paste(); } return; }
      if (event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
      if (event.code === 'Space') {
        if ((event.target as HTMLElement).closest('button,[role="button"]') && !(event.target as HTMLElement).closest('.timeline-clip')) return;
        event.preventDefault(); setCropClipId(null); playback.current?.toggle();
      }
      else if (event.key.toLowerCase() === 's') { event.preventDefault(); actions.current.split(); }
      else if (event.key === 'Delete') { event.preventDefault(); actions.current.remove(); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); actions.current.nudge(event.key, event.shiftKey ? 10 : 1); }
      else if (event.key === ',' || event.key === '.') { event.preventDefault(); const controller = playback.current; if (controller) { controller.pause(); void controller.seek(controller.time + (event.key === ',' ? -1 : 1) / (useProjectStore.getState().project?.canvas.fps || 30), false); } }
    };
    const endArrow = () => { arrowGroup.current = undefined; };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', endArrow); window.addEventListener('blur', endArrow);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', endArrow); window.removeEventListener('blur', endArrow); };
  }, [onNotice]);
  function seek(value: number) { if (Number.isFinite(value)) { setCropClipId(null); playback.current?.pause(); void playback.current?.seek(value, false); } }
  async function importVideos() {
    if (importing) return;
    const projectId = project.id;
    try {
      const chosen = await api.chooseMedia();
      if (!chosen || (Array.isArray(chosen) && !chosen.length)) return;
      playback.current?.pause(); setImporting(true);
      const result = await api.importMedia(Array.isArray(chosen) ? chosen : [chosen]);
      if (useProjectStore.getState().project?.id !== projectId) return;
      let id: string | null = null;
      const at = playback.current?.time ?? useSession.getState().time;
      useProjectStore.getState().edit(p => {
        const videos = result.media.filter(media => media.kind === 'video');
        if (videos.length) id = appendMedia(p, videos);
        for (const media of result.media) if (media.kind === 'image') id = addVisualLayer(p, at, media); else if (media.kind === 'audio') id = addAudioLayer(p, at, media);
      });
      selectClip(id);
      const added = useProjectStore.getState().project?.main.find(c => c.id === id);
      if (added) seek(added.start);
      if (result.warnings.length) onNotice(result.warnings.slice(0, 3).join(' '), true);
      else onNotice(`${result.media.length} ${result.media.length === 1 ? 'archivo añadido' : 'archivos añadidos'} a la línea de tiempo.`);
    } catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); }
    finally { setImporting(false); }
  }
  useEffect(() => {
    let active = true;
    void api.missingMedia(project).then(ids => { if (active) setMissing(ids); }).catch(error => { if (active) onNotice(String(error), true); });
    return () => { active = false; };
  }, [project.id, project.media, onNotice]);
  async function locateMedia(id: string) {
    const original = project.media.find(m => m.id === id); if (!original) return;
    try {
      const selected = await api.chooseMedia(), path = typeof selected === 'string' ? selected : selected?.[0]; if (!path) return;
      const result = await api.importMedia([path]); if (!result.media.length) throw new Error(result.warnings[0] ?? 'No se pudo analizar el archivo.');
      if (useProjectStore.getState().project?.id !== project.id) return;
      useProjectStore.getState().edit(p => relinkMedia(p, id, result.media[0]));
      onNotice('Archivo localizado. Guarda el proyecto para conservar la nueva ruta.');
    } catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); }
  }
  function appendAgain(mediaId: string) {
    const media = project.media.find(m => m.id === mediaId); if (!media) return;
    if (media.kind !== 'video') { addAsLayer(mediaId); return; }
    let id: string | null = null;
    try { useProjectStore.getState().edit(p => { id = appendMedia(p, [media]); }); selectClip(id); }
    catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); return; }
    const added = useProjectStore.getState().project?.main.find(c => c.id === id); if (added) seek(added.start);
  }
  function addAsLayer(mediaId: string) {
    const media = project.media.find(item => item.id === mediaId); if (!media) return;
    const at = playback.current?.time ?? useSession.getState().time;
    let id: string | null = null;
    try { useProjectStore.getState().edit(p => { id = media.kind === 'audio' ? addAudioLayer(p, at, media) : addVisualLayer(p, at, media); }); selectClip(id); seek(at); }
    catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); }
  }
  function addText() {
    const at = playback.current?.time ?? useSession.getState().time; let id: string | null = null;
    useProjectStore.getState().edit(p => { id = addVisualLayer(p, at); }); selectClip(id); seek(at);
  }
  function reorder(id: string, before: string | null) {
    try { useProjectStore.getState().edit(p => { reorderClip(p, id, before); }); }
    catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); }
  }
  function moveSelected(direction: number) {
    if (!selected) return;
    const index = project.main.findIndex(c => c.id === selected.id), target = index + direction;
    if (target < 0 || target >= project.main.length) return;
    reorder(selected.id, direction < 0 ? project.main[target].id : project.main[target + 1]?.id ?? null);
  }
  return <div className={`editor-layout ${project.orientation}`} style={workspaceStyle}>
    <header className="editor-topbar"><button className="back-button" disabled={exporting} onClick={onBack} aria-label="Volver al inicio"><ArrowLeft size={18} /><span className="brand-icon"><Clapperboard size={17} /></span></button><span className="topbar-divider" /><div className="project-title"><strong>{project.name || 'Sin nombre'}</strong><span className={dirty ? 'unsaved' : ''}>{dirty ? 'Sin guardar' : <><Check size={12} />Guardado</>}</span></div><div className="topbar-actions"><button className="secondary-button" disabled={presetBusy || !desktop || !selectedId} onClick={() => void savePreset()}>Guardar estilo</button><button className="secondary-button" disabled={!selectedId || (!presets[project.orientation].clip && !presets[project.orientation].text)} onClick={applyPreset}>Aplicar estilo</button><button className="icon-button" aria-label="Deshacer" title="Deshacer · Ctrl+Z" disabled={!past.length} onClick={() => useProjectStore.getState().undo()}><Undo2 size={18} /></button><button className="icon-button" aria-label="Rehacer" title="Rehacer · Ctrl+Shift+Z" disabled={!future.length} onClick={() => useProjectStore.getState().redo()}><Redo2 size={18} /></button><span className="topbar-divider" /><button aria-label="Guardar proyecto" title="Guardar proyecto" className="secondary-button" onClick={onSave} disabled={saving || !desktop}><Save size={16} />{saving ? 'Guardando…' : 'Guardar'}</button><button aria-label="Exportar" title="Exportar" className="primary-button" disabled={!duration || !desktop || importing} onClick={() => { playback.current?.pause(); setExportOpen(true); }}><ArrowDownToLine size={16} />Exportar</button></div></header>
    <div className={`editor-workspace ${project.orientation}`}>
      <aside className="media-panel"><div className="panel-heading">Medios<span>{project.media.length}</span><button className="icon-button" aria-label="Agregar archivos" title="Agregar archivos" disabled={importing || !desktop} onClick={() => void importVideos()}><Plus size={16} /></button></div>{missing.length > 0 && <div className="missing-media" role="status"><strong>Archivos no encontrados</strong>{missing.map(id => { const media = project.media.find(m => m.id === id); return media ? <div key={id}><span title={media.path}>{fileName(media.path)}</span><button className="secondary-button" onClick={() => void locateMedia(id)}>Localizar</button></div> : null; })}</div>}{project.media.length ? <div className="media-grid">{project.media.map(media => <div className="media-card" key={media.id}><button className="media-card-main" title={media.kind === 'video' ? 'Añadir a la pista principal' : 'Añadir a la línea de tiempo'} aria-label={`Añadir ${fileName(media.path)}${media.kind === 'video' ? ' al final' : ''}`} onClick={() => appendAgain(media.id)}>{media.thumbnail ? <img src={mediaUrl(media.thumbnail)} alt="" /> : media.kind === 'audio' ? <Music2 size={25} /> : media.kind === 'image' ? <ImageIcon size={25} /> : <Film size={25} />}<strong>{fileName(media.path)}</strong><small>{media.kind === 'image' ? `Imagen · ${media.w} × ${media.h}` : `${formatTime(media.duration)}${media.kind === 'video' ? ` · ${media.w} × ${media.h}` : ' · Audio'}`}</small></button>{media.kind === 'video' && <button className="media-card-add" aria-label={`Añadir ${fileName(media.path)} como capa`} title="Añadir como video superpuesto" onClick={() => addAsLayer(media.id)}><Layers2 size={14} /></button>}</div>)}</div> : <div className="media-empty"><Film size={31} strokeWidth={1.2} /><strong>Tu biblioteca de medios</strong><p>Añade videos, imágenes o audio para empezar a editar.</p><button className="secondary-button" disabled={importing || !desktop} onClick={() => void importVideos()}><Plus size={16} />{importing ? 'Analizando…' : 'Agregar archivos'}</button></div>}{proxyWorking.some(path => project.media.some(m => m.path === path)) && <p className="importing-status"><span className="loading-ring" />Preparando vista previa…</p>}{importing && <p className="importing-status"><span className="loading-ring" />Analizando archivos y miniaturas…</p>}</aside>
      <section className="preview-panel" ref={previewPanel}>
        <div className="preview-heading"><span>VISTA PREVIA</span><span>{project.canvas.w} × {project.canvas.h}<ChevronDown size={13} /></span></div>
        <div className="canvas-area">
          <div className={`video-canvas ${project.orientation}`}>
            <PreviewFrame
              editingDisabled={previewFullscreen || loading || !!error || exporting}
              onInteract={id => { playback.current?.pause(); selectClip(id); setCropClipId(null); }}
              project={project} time={time} videoRef={video} selected={selected}
              cropEditing={cropEditing} onNotice={onNotice}
            />
            <LayerPreview
              project={project} controller={layerController} suppressed={cropEditing} onNotice={onNotice}
              onSelect={id => { playback.current?.pause(); selectClip(id); setCropClipId(null); }}
            />
            {fitGuide && <span className="text-fit-guide" aria-hidden="true" style={{ left: `${fitGuide.left / project.canvas.w * 100}%`, top: `${fitGuide.top / project.canvas.h * 100}%`, width: `${fitGuide.width / project.canvas.w * 100}%`, height: `${fitGuide.height / project.canvas.h * 100}%` }} />}
            <span className="canvas-corner tl" /><span className="canvas-corner tr" />
            <span className="canvas-corner bl" /><span className="canvas-corner br" />
            {!duration && <div className="canvas-empty"><Clapperboard size={31} strokeWidth={1.1} /><p>Aquí empieza tu historia</p><span>Añade tu primer video</span></div>}
            {loading && <div className="preview-loading"><span className="loading-ring" /><span>Cargando fotograma…</span></div>}
            {error && <div className="preview-error" role="alert">{error}</div>}
          </div>
        </div>
        <div className="playback-bar">
          <div className="playback-time" title="Tiempo actual / duración total">
            {formatTime(time)} <span>/ {formatTime(duration)}</span>
          </div>
          <div className="playback-buttons">
            <button className="icon-button" aria-label="Fotograma anterior" disabled={!duration} onClick={() => seek((playback.current?.time ?? time) - 1 / project.canvas.fps)}><SkipBack size={13} /></button>
            <button className="play-button" disabled={!duration} aria-label={playing ? 'Pausar' : 'Reproducir'} onClick={() => playback.current?.toggle()}>{playing ? <Pause size={13} /> : <Play size={13} />}</button>
            <button className="icon-button" aria-label="Fotograma siguiente" disabled={!duration} onClick={() => seek((playback.current?.time ?? time) + 1 / project.canvas.fps)}><SkipForward size={13} /></button>
          </div>
          <button className="icon-button" type="button" aria-label={fullscreenLabel} title={fullscreenLabel} onClick={() => void togglePreviewFullscreen()}>
            {previewFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </section>
      <aside className={`properties-panel ${selected || selectedLayer ? 'editing-properties' : ''}`}>{!selected && !selectedLayer && <div className="panel-heading">Proyecto</div>}{selected && <div className="clip-properties">
        <ClipTools key={selected.id} project={project} clip={selected} onNotice={onNotice} cropEditing={cropClipId === selected.id} onCropToggle={() => { if (cropClipId === selected.id) setCropClipId(null); else { seek(selected.start); setCropClipId(selected.id); } }} />
        {!project.autoJoin && <form onSubmit={e => {
          e.preventDefault(); try { useProjectStore.getState().edit(p => trimClip(p, selected.id, selected.srcStart, selected.srcEnd, Number(start))); const next = useProjectStore.getState().project?.main.find(c => c.id === selected.id); if (next) seek(next.start); } catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); }
        }}><label className="field-label">Inicio en la línea de tiempo (s)<input className="text-input" type="number" min={0} step="any" value={start} onChange={e => setStart(e.target.value)} /></label><button className="secondary-button clip-move-apply" type="submit">Mover clip</button></form>}
        <div className="clip-reorder"><button type="button" className="icon-button" aria-label="Mover clip antes" disabled={!project.autoJoin || project.main[0]?.id === selected.id} onClick={() => moveSelected(-1)}><ArrowLeft size={16} /></button><span>{formatTime(clipDuration(selected), true)}</span><button type="button" className="icon-button" aria-label="Mover clip después" disabled={!project.autoJoin || project.main.at(-1)?.id === selected.id} onClick={() => moveSelected(1)}><ArrowRight size={16} /></button></div>{presetActions}</div>}
        {selectedLayer && <LayerControls key={selectedLayer.id} project={project} item={selectedLayer} onNotice={onNotice} />}
        {selectedLayer && 'type' in selectedLayer && selectedLayer.type === 'text' && presetActions}
        <details className="project-settings" open={!selected && !selectedLayer ? true : undefined}><summary>Configuración del proyecto</summary><label className="field-label" htmlFor="project-name">Nombre del proyecto</label><input id="project-name" className="text-input" value={project.name} maxLength={120} onFocus={() => { nameGroup.current = crypto.randomUUID(); }} onChange={e => useProjectStore.getState().edit(p => { p.name = e.target.value; }, nameGroup.current)} /><label className="field-label">Formato</label><div className="orientation-toggle"><button className={project.orientation === 'horizontal' ? 'selected' : ''} onClick={() => useProjectStore.getState().setOrientation('horizontal')}><Monitor size={17} />Horizontal</button><button className={project.orientation === 'vertical' ? 'selected' : ''} onClick={() => useProjectStore.getState().setOrientation('vertical')}><Smartphone size={17} />Vertical</button></div><dl className="project-details"><div><dt>Lienzo</dt><dd>{project.canvas.w} × {project.canvas.h}</dd></div><div><dt>Cabezal</dt><dd>{project.canvas.fps} fps</dd></div><div><dt>Duración</dt><dd>{formatTime(duration, true)}</dd></div></dl><div className="property-separator" /><label className="check-option"><input type="checkbox" checked={project.autoJoin} onChange={e => useProjectStore.getState().setAutoJoin(e.target.checked)} /><span>Unión automática</span></label></details>
      </aside>
    </div>
    <Timeline onResizeLayer={(id, duration, group) => { try { useProjectStore.getState().edit(p => { const item = p.overlays.find(o => o.id === id); if (!item) return; const next = p.overlays.filter(o => o.id !== id && (o.track ?? 0) === (item.track ?? 0) && o.start >= item.start + item.duration - 1e-6).reduce((end, o) => Math.min(end, o.start), Infinity); updateOverlay(p, id, { duration: Math.min(duration, next - item.start) }); }, group); } catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); } }} onMainToLayer={(id, start, track) => { try { useProjectStore.getState().edit(p => { const c = p.main.find(x => x.id === id); if (!c) return; if (c.flipH || c.flipV || c.zoom !== 1 || c.stretchX !== 1 || c.stretchY !== 1 || c.crop.x !== 0 || c.crop.y !== 0 || c.crop.w !== 1 || c.crop.h !== 1) throw new Error('Este clip tiene transformaciones; utiliza el botón de capa de su archivo para crear una superposición.'); const media = p.media.find(m => m.id === c.mediaId)!; const layer = addVisualLayer(p, start, media); updateOverlay(p, layer, { srcStart: c.srcStart, srcEnd: c.srcEnd, speed: c.speed, volume: c.volume, posX: c.posX, posY: c.posY, scale: 1 }); moveLayer(p, layer, start, track); deleteClip(p, id); selectClip(layer); }); } catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); } }} onAddText={addText} onMoveLayer={(id, start, track) => { try { useProjectStore.getState().edit(p => moveLayer(p, id, start, track)); } catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); } }} tools={selected && <ClipToolButtons project={project} clip={selected} onNotice={onNotice} cropEditing={cropClipId === selected.id} onCropToggle={() => { if (cropClipId === selected.id) setCropClipId(null); else { seek(selected.start); setCropClipId(selected.id); } }} />} project={project} onSeek={seek} onSelect={id => { playback.current?.pause(); selectClip(id); }} onReorder={reorder} onSplit={() => actions.current.split()} onDelete={() => actions.current.remove()} />
    <footer className="editor-footer">{engineStatus}<span title={filePath ?? ''}>{filePath ? <><CheckCircle2 size={12} />Proyecto local</> : 'Sin guardar'}<span className="footer-dot">·</span>Espacio · S dividir · Supr borrar</span></footer>
    {exportOpen && <ExportDialog project={project} onClose={() => setExportOpen(false)} />}
  </div>;
}
