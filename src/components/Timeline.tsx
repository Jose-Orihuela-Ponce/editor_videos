import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { Film, Music2, Scissors, Trash2, Type } from 'lucide-react';
import type { AudioClip, Overlay, Project } from '../core/project';
import { timelineExtent } from '../core/layers';
import { clipDuration, formatTime, projectDuration } from '../core/timeline';
import { mediaUrl, onPlaybackFrame } from '../core/playback';
import { useSession } from '../core/session';
import { rulerStep, timelineScale, zoomScrollLeft } from '../core/timelineView';

export default function Timeline({ project, onSeek, onSelect, onReorder, onSplit, onDelete, tools, onAddText, onMoveLayer, onMainToLayer, onResizeLayer }: { project: Project; onSeek: (time: number) => void; onSelect: (id: string) => void; onReorder: (id: string, before: string | null) => void; onSplit: () => void; onDelete: () => void; tools?: ReactNode; onAddText: () => void; onMoveLayer: (id: string, start: number, track: number) => void; onMainToLayer: (id: string, start: number, track: number) => void; onResizeLayer: (id: string, duration: number, group: string) => void }) {
  const time = useSession(s => s.time), selectedId = useSession(s => s.selectedId), zoomLevel = useSession(s => s.zoom);
  const section = useRef<HTMLElement>(null), scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null), playhead = useRef<HTMLSpanElement>(null);
  const [viewportWidth, setViewportWidth] = useState(1), [scrollLeft, setScrollLeft] = useState(0);
  const anchor = useRef<{ time: number; offset: number } | null>(null);
  const previousScale = useRef(0);
  const [drag, setDrag] = useState<{ id: string; fromX: number; fromY: number; offset: number; before: string | null } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  const duration = timelineExtent(project);
  const visualTracks = [...new Set([0, ...project.overlays.map(item => item.track ?? 0), ])].sort((a, b) => b - a);
  const audioTracks = [...new Set([0, ...project.audio.map(item => item.track ?? 0), ])].sort((a, b) => a - b);
  const freeDrag = useRef<{ id: string; kind: 'visual' | 'audio'; x: number; y: number; start: number; track: number; offsetX: number; offsetY: number } | null>(null);
  const [freeMoving, setFreeMoving] = useState<typeof freeDrag.current>(null);
  const { span, pixelsPerSecond: zoom, width } = timelineScale(duration, viewportWidth, zoomLevel);
  useLayoutEffect(() => {
    const element = scroll.current; if (!element) return;
    const resize = () => setViewportWidth(element.clientWidth);
    resize();
    const observer = new ResizeObserver(resize); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = scroll.current; if (!element) return;
    const focus = anchor.current ?? { time: element.scrollLeft / (previousScale.current || zoom), offset: 0 };
    element.scrollLeft = zoomScrollLeft(focus.time, focus.offset, zoom, width, viewportWidth);
    setScrollLeft(element.scrollLeft); anchor.current = null; previousScale.current = zoom;
  }, [zoom, width, viewportWidth]);
  function changeZoom(next: number, clientX?: number) {
    const level = Math.max(0, Math.min(100, next));
    if (level === useSession.getState().zoom) return;
    const element = scroll.current;
    if (element) {
      const offset = clientX === undefined ? element.clientWidth / 2 : Math.max(0, Math.min(element.clientWidth, clientX - element.getBoundingClientRect().left));
      anchor.current = { time: (element.scrollLeft + offset) / zoom, offset };
    }
    useSession.setState({ zoom: level });
  }
  useEffect(() => {
    const element = section.current; if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportWidth : 1);
      changeZoom(useSession.getState().zoom - Math.max(-20, Math.min(20, delta * 0.08)), event.clientX);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [zoom, viewportWidth]);
  useEffect(() => { if (playhead.current) playhead.current.style.left = `${time * zoom}px`; }, [time, zoom]);
  useEffect(() => onPlaybackFrame(current => { if (playhead.current) playhead.current.style.left = `${current * zoom}px`; }), [zoom]);
  const step = rulerStep(zoom);
  const firstTick = Math.max(0, Math.floor(scrollLeft / zoom / step) - 1);
  const lastTick = Math.min(Math.floor(span / step), Math.ceil((scrollLeft + viewportWidth) / zoom / step) + 1);
  const ticks = Array.from({ length: Math.max(0, lastTick - firstTick + 1) }, (_, index) => (firstTick + index) * step);
  function pointTime(clientX: number) { return Math.max(0, Math.min(duration, (clientX - (content.current?.getBoundingClientRect().left ?? clientX)) / zoom)); }
  function scrub(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.timeline-clip')) return;
    event.currentTarget.setPointerCapture(event.pointerId); onSeek(pointTime(event.clientX));
  }
  function dragStart(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); onSelect(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id, fromX: event.clientX, fromY: event.clientY, offset: 0, before: id };
  }
  function dragMove(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current; if (!current) return;
    const offset = event.clientX - current.fromX;
    if (Math.hypot(offset, event.clientY - current.fromY) < 6 && !drag) return;
    const rawTime = (event.clientX - (content.current?.getBoundingClientRect().left ?? event.clientX)) / zoom;
    const before = project.main.find(c => c.id !== current.id && c.start + clipDuration(c) / 2 > rawTime)?.id ?? null;
    dragRef.current = { ...current, offset, before }; setDrag(dragRef.current);
  }
  function dragEnd(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current; dragRef.current = null; setDrag(null);
    if (!current) return;
    const row = [...(section.current?.querySelectorAll<HTMLElement>('[data-layer-kind="visual"]') ?? [])].find(el => { const r = el.getBoundingClientRect(); return event.clientY >= r.top && event.clientY < r.bottom; });
    if (row && Math.hypot(current.offset, event.clientY - current.fromY) >= 6) { const clip = project.main.find(c => c.id === current.id); if (clip) onMainToLayer(current.id, Math.max(0, clip.start + current.offset / zoom), Number(row.dataset.layerTrack)); }
    else if (Math.abs(current.offset) >= 6) onReorder(current.id, current.before);
    else onSeek(pointTime(event.clientX));
  }
  function beginFree(event: PointerEvent<HTMLButtonElement>, id: string, kind: 'visual' | 'audio', start: number, track: number) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); onSelect(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    freeDrag.current = { id, kind, x: event.clientX, y: event.clientY, start, track, offsetX: 0, offsetY: 0 };
  }
  function moveFree(event: PointerEvent<HTMLButtonElement>) {
    const current = freeDrag.current; if (!current) return;
    const offsetX = event.clientX - current.x, offsetY = event.clientY - current.y;
    if (Math.hypot(offsetX, offsetY) < 6 && !freeMoving) return;
    freeDrag.current = { ...current, offsetX, offsetY }; setFreeMoving(freeDrag.current);
  }
  function endFree(event: PointerEvent<HTMLButtonElement>) {
    const current = freeDrag.current; freeDrag.current = null; setFreeMoving(null); if (!current) return;
    if (Math.hypot(current.offsetX, current.offsetY) < 6) { onSeek(pointTime(event.clientX)); return; }
    const rows = section.current?.querySelectorAll<HTMLElement>(`[data-layer-kind="${current.kind}"]`);
    const row = [...(rows ?? [])].find(element => { const rect = element.getBoundingClientRect(); return event.clientY >= rect.top && event.clientY < rect.bottom; });
    const rects = [...(rows ?? [])].map(el => el.getBoundingClientRect());
    const outside = rects.length && (current.kind === 'visual' ? event.clientY < Math.min(...rects.map(r => r.top)) : event.clientY > Math.max(...rects.map(r => r.bottom)));
    const track = row ? Number(row.dataset.layerTrack) : outside ? Math.min(1000, Math.max(...[...(rows ?? [])].map(el => Number(el.dataset.layerTrack))) + 1) : current.track;
    onMoveLayer(current.id, Math.max(0, current.start + current.offsetX / zoom), track);
  }
  function freeItem(item: Overlay | AudioClip, kind: 'visual' | 'audio') {
    const media = project.media.find(m => m.id === item.mediaId), visual = 'type' in item ? item : undefined;
    const length = visual ? visual.duration : clipDuration(item as AudioClip);
    const name = visual?.type === 'text' ? (visual.text || 'Texto') : media?.path.split(/[\\/]/).at(-1) ?? 'Original';
    const type = visual?.type === 'video' ? 'Video' : visual?.type === 'image' ? 'Imagen' : visual?.type === 'text' ? 'Texto' : 'Audio';
    return <button key={item.id} aria-label={`${type}: ${name}`} aria-pressed={selectedId === item.id} title="Seleccionar o arrastrar en la línea de tiempo" className={`timeline-clip layer-timeline-clip ${kind} ${selectedId === item.id ? 'selected' : ''} ${freeMoving?.id === item.id ? 'dragging' : ''}`} style={{ left: item.start * zoom, width: Math.max(4, length * zoom), transform: freeMoving?.id === item.id ? `translate(${freeMoving.offsetX}px, ${freeMoving.offsetY}px)` : undefined }} onPointerDown={event => beginFree(event, item.id, kind, item.start, item.track ?? 0)} onPointerMove={moveFree} onPointerUp={endFree} onPointerCancel={() => { freeDrag.current = null; setFreeMoving(null); }} onClick={event => { if (event.detail === 0) { onSelect(item.id); onSeek(item.start); } }}><span>{type}: {name}</span><small>{formatTime(length, true)}</small>{visual && visual.type !== 'video' && <span className="layer-resize" role="slider" aria-label="Cambiar duración" title="Arrastrar para cambiar duración" onPointerDown={e => { e.stopPropagation(); e.preventDefault(); onSelect(item.id); e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.origin = String(e.clientX); e.currentTarget.dataset.duration = String(length); e.currentTarget.dataset.group = crypto.randomUUID(); }} onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; e.stopPropagation(); onResizeLayer(item.id, Math.max(1 / project.canvas.fps, Number(e.currentTarget.dataset.duration) + (e.clientX - Number(e.currentTarget.dataset.origin)) / zoom), e.currentTarget.dataset.group!); }} onPointerUp={e => { e.stopPropagation(); }} />}</button>;
  }
  return <section ref={section} className="timeline">
    <div className="timeline-toolbar"><span>Línea de tiempo</span><div><button className="icon-button" disabled={!selectedId && !project.main.length} aria-label="Dividir en el cabezal" title="Dividir · S" onClick={onSplit}><Scissors size={16} /></button><button className="icon-button" disabled={!selectedId} aria-label="Borrar clip seleccionado" title="Borrar · Supr" onClick={onDelete}><Trash2 size={16} /></button>{tools}<button className="icon-button" aria-label="Agregar texto" title="Agregar texto" onClick={onAddText}><Type size={16} /></button><span className="quiet-label">{duration ? `${project.main.length} ${project.main.length === 1 ? 'clip' : 'clips'} · ${formatTime(projectDuration(project))}` : 'Proyecto vacío'}</span></div><div className="timeline-scale" title="Zoom · Ctrl + rueda del mouse"><button aria-label="Alejar línea de tiempo" onClick={() => changeZoom(zoomLevel - 10)}>−</button><input aria-label="Zoom de la línea de tiempo" type="range" min={0} max={100} step="any" value={zoomLevel} onChange={e => changeZoom(Number(e.target.value))} /><button aria-label="Acercar línea de tiempo" onClick={() => changeZoom(zoomLevel + 10)}>+</button></div></div>
    <div className="timeline-body"><div className="track-labels"><span />{visualTracks.map(track => <span key={`v${track}`}><Type size={14} />Capa {track + 1}</span>)}<span><Film size={14} />Principal</span>{audioTracks.map(track => <span key={`a${track}`}><Music2 size={14} />Audio {track + 1}</span>)}</div><div ref={scroll} className="timeline-scroll" onScroll={e => setScrollLeft(e.currentTarget.scrollLeft)}><div ref={content} className="timeline-tracks" style={{ width, minWidth: '100%' }} onPointerDown={scrub} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) onSeek(pointTime(e.clientX)); }}>
      <div className="time-ruler">{ticks.map(t => <span style={{ left: t * zoom }} key={t}>{formatTime(t)}</span>)}</div>
      {visualTracks.map(track => <div key={`v${track}`} className="track-row free-track" data-layer-kind="visual" data-layer-track={track}>{project.overlays.filter(item => (item.track ?? 0) === track).map(item => freeItem(item, 'visual'))}</div>)}
      <div className="track-row main-track">{!project.main.length && <span>Añade un video desde Medios</span>}{project.main.map((clip, index) => {
        const media = project.media.find(m => m.id === clip.mediaId);
        return <button key={clip.id} aria-label={`Clip ${index + 1}: ${media?.path.split(/[\\/]/).at(-1) ?? 'Video'}`} aria-pressed={selectedId === clip.id} title="Seleccionar o arrastrar para reordenar" className={`timeline-clip ${selectedId === clip.id ? 'selected' : ''} ${drag?.id === clip.id ? 'dragging' : ''} ${drag && drag.id !== clip.id && drag.before === clip.id ? 'insert-before' : ''}`} style={{ left: clip.start * zoom, width: Math.max(4, clipDuration(clip) * zoom), transform: drag?.id === clip.id ? `translateX(${drag.offset}px)` : undefined }} onPointerDown={e => dragStart(e, clip.id)} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={() => { dragRef.current = null; setDrag(null); }} onClick={e => { if (e.detail === 0) { onSelect(clip.id); onSeek(clip.start); } }}>
          {media?.thumbnail && <img src={mediaUrl(media.thumbnail)} alt="" draggable={false} />}<span>{index + 1}. {media?.path.split(/[\\/]/).at(-1)}</span><small>{formatTime(clipDuration(clip), true)}</small>
        </button>;
      })}</div>
      {audioTracks.map(track => <div key={`a${track}`} className="track-row free-track" data-layer-kind="audio" data-layer-track={track}>{project.audio.filter(item => (item.track ?? 0) === track).map(item => freeItem(item, 'audio'))}</div>)}
      <span ref={playhead} className="playhead"><i /></span>
    </div></div></div>
  </section>;
}
