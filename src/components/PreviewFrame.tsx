import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, RefObject } from 'react';
import type { Clip, Project } from '../core/project';
import { getVisualSettings } from '../tools/effects';
import { clipAt, projectDuration } from '../core/timeline';
import { updateClipSettings } from '../core/clipSettings';
import { useProjectStore } from '../core/store';
import { snapToCenter } from '../core/snapping';

interface Props {
  project: Project; time: number; videoRef: RefObject<HTMLVideoElement | null>;
  cropEditing: boolean; selected?: Clip; onNotice: (message: string, error?: boolean) => void;
  editingDisabled: boolean; onInteract: (id: string) => void;
}
const percent = (n: number) => `${n * 100}%`;
export default function PreviewFrame({ project, time, videoRef, cropEditing, selected, onNotice, editingDisabled, onInteract }: Props) {
  const current = clipAt(project, time >= projectDuration(project) ? Math.max(0, projectDuration(project) - 1 / project.canvas.fps) : time);
  const clip = cropEditing && selected?.id === current?.id ? selected : current;
  const media = project.media.find(m => m.id === clip?.mediaId);
  const editCrop = cropEditing && !!clip && clip.id === selected?.id;
  const drag = useRef<{ x: number; y: number; width: number; height: number; crop: Clip['crop']; handle: string; group: string; id: string } | null>(null);
  const positionDrag = useRef<{ x: number; y: number; width: number; height: number; posX: number; posY: number; id: string; group: string; moved: boolean; snapX: boolean; snapY: boolean } | null>(null);
  const [guides, setGuides] = useState<{ id: string; x: boolean; y: boolean } | null>(null);
  function endPosition() { positionDrag.current = null; setGuides(null); }
  useEffect(endPosition, [project.id, project.orientation, clip?.id, editCrop, editingDisabled]);
  let moveStyle: CSSProperties | undefined;
  let frameStyle: CSSProperties = { inset: 0 }, videoStyle: CSSProperties = {};
  if (clip && media) {
    const settings = editCrop ? { ...clip, crop: { x: 0, y: 0, w: 1, h: 1 }, flipH: false, flipV: false, zoom: 1, stretchX: 1, stretchY: 1, posX: 0, posY: 0 } : clip;
    const { geometry: g, flip } = getVisualSettings(media, project.canvas, settings);
    frameStyle = { left: percent(g.left / project.canvas.w), top: percent(g.top / project.canvas.h), width: percent(g.width / project.canvas.w), height: percent(g.height / project.canvas.h), transform: `scale(${flip.scaleX},${flip.scaleY})` };
    moveStyle = { left: frameStyle.left, top: frameStyle.top, width: frameStyle.width, height: frameStyle.height };
    const w = media.w || project.canvas.w, h = media.h || project.canvas.h;
    videoStyle = { left: percent(-g.crop.x / g.crop.w), top: percent(-g.crop.y / g.crop.h), width: percent(w / g.crop.w), height: percent(h / g.crop.h) };
  }
  function beginPosition(event: PointerEvent<HTMLButtonElement>) {
    if (!clip || editCrop || editingDisabled || event.button !== 0 || videoRef.current?.hidden) return;
    const canvas = event.currentTarget.parentElement;
    if (!canvas?.clientWidth || !canvas.clientHeight) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    positionDrag.current = { x: event.clientX, y: event.clientY, width: canvas.clientWidth, height: canvas.clientHeight,
      posX: clip.posX, posY: clip.posY, id: clip.id, group: crypto.randomUUID(), moved: false, snapX: clip.posX === 0, snapY: clip.posY === 0 };
    setGuides(null);
    onInteract(clip.id);
  }
  function movePosition(event: PointerEvent<HTMLButtonElement>) {
    const d = positionDrag.current;
    if (!d || !clip || d.id !== clip.id || editingDisabled) return;
    const dx = event.clientX - d.x, dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    const x = snapToCenter(d.posX + dx * project.canvas.w / d.width, project.canvas.w, d.width, d.snapX, event.altKey);
    const y = snapToCenter(d.posY + dy * project.canvas.h / d.height, project.canvas.h, d.height, d.snapY, event.altKey);
    d.snapX = x.snapped; d.snapY = y.snapped;
    setGuides({ id: d.id, x: x.snapped, y: y.snapped });
    const posX = Math.max(-2 * project.canvas.w, Math.min(2 * project.canvas.w, x.position));
    const posY = Math.max(-2 * project.canvas.h, Math.min(2 * project.canvas.h, y.position));
    try { useProjectStore.getState().edit(p => updateClipSettings(p, d.id, { posX, posY }), d.group); }
    catch (error) { endPosition(); onNotice(error instanceof Error ? error.message : String(error), true); }
  }
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (!editCrop || !clip || event.button !== 0) return;
    const handle = (event.target as HTMLElement).dataset.handle;
    if (!handle) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, crop: { ...clip.crop }, handle, group: crypto.randomUUID(), id: clip.id };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d || !clip || d.id !== clip.id) return;
    const dx = (event.clientX - d.x) / d.width, dy = (event.clientY - d.y) / d.height;
    const c = d.crop, clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    let crop = { ...c };
    if (d.handle === 'move') crop = { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) };
    else {
      const minW = 2 / (media?.w || project.canvas.w), minH = 2 / (media?.h || project.canvas.h);
      const left = d.handle.includes('w') ? clamp(c.x + dx, 0, c.x + c.w - minW) : c.x;
      const top = d.handle.includes('n') ? clamp(c.y + dy, 0, c.y + c.h - minH) : c.y;
      const right = d.handle.includes('e') ? clamp(c.x + c.w + dx, c.x + minW, 1) : c.x + c.w;
      const bottom = d.handle.includes('s') ? clamp(c.y + c.h + dy, c.y + minH, 1) : c.y + c.h;
      crop = { x: left, y: top, w: right - left, h: bottom - top };
    }
    try { useProjectStore.getState().edit(p => updateClipSettings(p, d.id, { crop }), d.group); }
    catch (error) { drag.current = null; onNotice(String(error instanceof Error ? error.message : error), true); }
  }
  return <>
    <div className="preview-transform" style={frameStyle}>
      <video ref={videoRef} className="preview-video" style={videoStyle} playsInline crossOrigin="anonymous" aria-label="Vista previa del proyecto" />
      {editCrop && clip && <div className="crop-overlay" onPointerDown={begin} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className="crop-box" data-handle="move" style={{ left: percent(clip.crop.x), top: percent(clip.crop.y), width: percent(clip.crop.w), height: percent(clip.crop.h) }}>
          {['nw', 'ne', 'sw', 'se'].map(handle => <span key={handle} className={`crop-handle ${handle}`} data-handle={handle} />)}
        </div>
      </div>}
    </div>
    {!editCrop && clip && moveStyle && <button type="button" className={`preview-move-target ${clip.id === selected?.id ? 'selected' : ''}`} style={moveStyle}
      aria-label="Mover video en la vista previa" title="Arrastrar para mover · Alt para mover sin imán" disabled={editingDisabled}
      onPointerDown={beginPosition} onPointerMove={movePosition}
      onPointerUp={endPosition} onPointerCancel={endPosition} onLostPointerCapture={endPosition}
      onClick={event => { if (event.detail === 0) onInteract(clip.id); }} />}
    {!editCrop && guides && guides.id === clip?.id && <div className="preview-alignment-guides" aria-hidden="true">
      {guides?.x && <span className="alignment-guide vertical" />}
      {guides?.y && <span className="alignment-guide horizontal" />}
    </div>}
    {editCrop && <span className="crop-instruction">Original · arrastra el recuadro o sus esquinas</span>}
  </>;
}
