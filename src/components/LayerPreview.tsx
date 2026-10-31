import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { AudioClip, Overlay, Project } from '../core/project';
import type { PlaybackController } from '../core/playback';
import { mediaUrl, onPlaybackFrame } from '../core/playback';
import { layerGeometry } from '../core/layerGeometry';
import { isActive, updateOverlay } from '../core/layers';
import { projectDuration } from '../core/timeline';
import { useProjectStore } from '../core/store';
import { useSession } from '../core/session';
import { snapToCenter } from '../core/snapping';
import { drawText } from '../tools/text/render';

interface Props { project: Project; controller: PlaybackController | null; suppressed: boolean; onSelect: (id: string) => void; onNotice: (text: string, error?: boolean) => void }
const percent = (value: number) => `${value * 100}%`;

function AudioElement({ item, controller }: { item: AudioClip; controller: PlaybackController | null }) {
  const element = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (controller && element.current) return controller.registerLayer(item.id, element.current); }, [controller, item.id]);
  return <audio ref={element} className="layer-audio-element" crossOrigin="anonymous" aria-label="Audio adicional" />;
}

function VisualLayer({ project, item, controller, suppressed, onSelect, onNotice }: Props & { item: Overlay }) {
  const selected = useSession(s => s.selectedId === item.id), time = useSession(s => s.time);
  const wrapper = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), textCanvas = useRef<HTMLCanvasElement>(null);
  const [bounds, setBounds] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [guides, setGuides] = useState<{ x: boolean; y: boolean } | null>(null);
  const drag = useRef<{ x: number; y: number; w: number; h: number; px: number; py: number; group: string; moved: boolean; snapX: boolean; snapY: boolean } | null>(null);
  const media = project.media.find(m => m.id === item.mediaId);
  const duration = projectDuration(project);
  function display(current: number) {
    const t = current >= duration && duration > 0 ? Math.max(0, duration - 1 / project.canvas.fps) : current;
    if (wrapper.current) wrapper.current.style.visibility = !suppressed && isActive(item.start, item.duration, t) ? 'visible' : 'hidden';
  }
  useEffect(() => { display(time); return onPlaybackFrame(display); }, [item.start, item.duration, duration, project.canvas.fps, suppressed]);
  useEffect(() => { display(time); }, [time]);
  useEffect(() => { if (controller && video.current && item.type === 'video') return controller.registerLayer(item.id, video.current); }, [controller, item.id, item.type]);
  useLayoutEffect(() => {
    if (item.type !== 'text' || !textCanvas.current || !item.style) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !textCanvas.current) return;
      const { surface, bounds: next } = drawText(item, project.canvas);
      const canvas = textCanvas.current; canvas.width = surface.width; canvas.height = surface.height;
      canvas.getContext('2d')?.drawImage(surface, 0, 0); setBounds(next);
    };
    render();
    const style = item.style;
    void document.fonts.load(`${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${style.size}px ${JSON.stringify(style.font)}`).then(render).catch(() => {});
    return () => { cancelled = true; };
  }, [item, project.canvas]);
  const geometry = media ? layerGeometry(media, project.canvas, item) : null;
  const box = item.type === 'text' ? bounds : geometry;
  const style: CSSProperties = item.type === 'text' ? { inset: 0 } : geometry ? {
    left: percent(geometry.left / project.canvas.w), top: percent(geometry.top / project.canvas.h),
    width: percent(geometry.width / project.canvas.w), height: percent(geometry.height / project.canvas.h),
  } : { display: 'none' };
  style.zIndex = 10 + (item.track ?? 0);
  function begin(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const canvas = event.currentTarget.closest('.video-canvas') as HTMLElement | null;
    if (!canvas?.clientWidth || !canvas.clientHeight) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, w: canvas.clientWidth, h: canvas.clientHeight, px: item.posX, py: item.posY, group: crypto.randomUUID(), moved: false, snapX: item.posX === 0, snapY: item.posY === 0 };
    setGuides(null); onSelect(item.id);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current; if (!d) return;
    const dx = event.clientX - d.x, dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return; d.moved = true;
    const x = snapToCenter(d.px + dx * project.canvas.w / d.w, project.canvas.w, d.w, d.snapX, event.altKey);
    const y = snapToCenter(d.py + dy * project.canvas.h / d.h, project.canvas.h, d.h, d.snapY, event.altKey);
    d.snapX = x.snapped; d.snapY = y.snapped; setGuides({ x: x.snapped, y: y.snapped });
    try { useProjectStore.getState().edit(p => updateOverlay(p, item.id, { posX: Math.max(-2 * p.canvas.w, Math.min(2 * p.canvas.w, x.position)), posY: Math.max(-2 * p.canvas.h, Math.min(2 * p.canvas.h, y.position)) }), d.group); }
    catch (error) { drag.current = null; setGuides(null); onNotice(error instanceof Error ? error.message : String(error), true); }
  }
  const hitStyle = item.type === 'text' && box ? { left: percent(box.left / project.canvas.w), top: percent(box.top / project.canvas.h), width: percent(box.width / project.canvas.w), height: percent(box.height / project.canvas.h) } : { inset: 0 };
  return <>
    <div ref={wrapper} className="visual-layer" style={style}>
      {item.type === 'text' ? <canvas ref={textCanvas} className="layer-text-canvas" /> : item.type === 'image' && media ? <img src={mediaUrl(media.path)} alt="" draggable={false} /> : item.type === 'video' ? <video ref={video} playsInline crossOrigin="anonymous" aria-label="Video superpuesto" /> : null}
      <button type="button" className={`layer-hit-area ${selected ? 'selected' : ''}`} style={hitStyle} aria-label={`Mover ${item.type === 'text' ? 'texto' : item.type === 'image' ? 'imagen' : 'video superpuesto'} en la vista previa`} title="Arrastrar para mover · Alt para mover sin imán"
        onPointerDown={begin} onPointerMove={move} onPointerUp={() => { drag.current = null; setGuides(null); }} onPointerCancel={() => { drag.current = null; setGuides(null); }} onLostPointerCapture={() => { drag.current = null; setGuides(null); }} onClick={e => { if (e.detail === 0) onSelect(item.id); }} />
    </div>
    {guides && <div className="preview-alignment-guides layer-guides" aria-hidden="true">{guides.x && <span className="alignment-guide vertical" />}{guides.y && <span className="alignment-guide horizontal" />}</div>}
  </>;
}

export default function LayerPreview(props: Props) {
  const ordered = props.project.overlays.map((item, index) => ({ item, index })).sort((a, b) => (a.item.track ?? 0) - (b.item.track ?? 0) || a.index - b.index);
  return <>{ordered.map(({ item }) => <VisualLayer key={item.id} {...props} item={item} />)}{props.project.audio.map(item => <AudioElement key={item.id} item={item} controller={props.controller} />)}</>;
}
