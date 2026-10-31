import { useRef } from 'react';
import type { AudioClip, Overlay, Project, TextStyle } from '../../core/project';
import { moveLayer, updateAudio, updateOverlay } from '../../core/layers';
import { useProjectStore } from '../../core/store';
import { clipDuration, formatTime } from '../../core/timeline';
import NumberField from '../NumberField';
import { fittedTextValue } from '../text/fit';
import { showFitGuide, useSession } from '../../core/session';

interface Props { project: Project; item: Overlay | AudioClip; onNotice: (message: string, error?: boolean) => void }
export default function LayerControls({ project, item, onNotice }: Props) {
  const visual = 'type' in item ? item : undefined, audio = visual ? undefined : item as AudioClip;
  const group = useRef('');
  const update = (patch: Partial<Overlay> | Partial<AudioClip>, editGroup?: string) => {
    try {
      useProjectStore.getState().edit(p => {
        if (visual) { updateOverlay(p, item.id, patch as Partial<Overlay>); const next = p.overlays.find(o => o.id === item.id)!; moveLayer(p, item.id, next.start, next.track); }
        else { updateAudio(p, item.id, patch as Partial<AudioClip>); const next = p.audio.find(a => a.id === item.id)!; moveLayer(p, item.id, next.start, next.track); }
      }, editGroup);
      return true;
    } catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); return false; }
  };
  const move = (start: number, track: number, editGroup?: string) => {
    try { useProjectStore.getState().edit(p => moveLayer(p, item.id, start, track), editGroup); return true; }
    catch (error) { onNotice(error instanceof Error ? error.message : String(error), true); return false; }
  };
  const style = visual?.style;
  const styleChange = (patch: Partial<TextStyle>, editGroup?: string) => style && update({ style: { ...style, ...patch } }, editGroup);
  const backgroundEnabled = style?.bgEnabled ?? ((style?.bgOpacity ?? 0) > 0);
  const currentDuration = visual ? visual.duration : clipDuration(audio!);
  function snappedValue(value: number, property: 'size' | 'scale', source: 'field' | 'slider') {
    if (source !== 'slider' || visual?.type !== 'text') return value;
    const fit = fittedTextValue(project, visual, useSession.getState().time, property);
    if (fit?.limited && Math.abs(value - fit.value) <= Math.max(property === 'size' ? 2 : 0.03, fit.value * 0.025)) { showFitGuide(fit.rect); return fit.value; }
    return value;
  }
  function fitText() {
    if (!visual || visual.type !== 'text') return;
    const fit = fittedTextValue(project, visual, useSession.getState().time, 'scale', true);
    if (!fit) { onNotice('El texto no cabe en el área visible del video.', true); return; }
    if (update({ scale: fit.value, posX: fit.posX, posY: fit.posY })) showFitGuide(fit.rect);
  }
  return <div className="layer-controls">
    <div className="clip-tools-heading">{audio ? 'Audio seleccionado' : visual?.type === 'text' ? 'Texto seleccionado' : visual?.type === 'image' ? 'Imagen seleccionada' : 'Video seleccionado'}</div>
    {visual?.type === 'text' && style && <><details className="clip-tool-group" open><summary>Contenido</summary><section className="clip-tool-section">
      <label className="field-label">Contenido<textarea className="text-input layer-text-input" value={visual.text ?? ''} maxLength={5000} onFocus={() => { group.current = crypto.randomUUID(); }} onBlur={() => { group.current = ''; }} onChange={e => update({ text: e.target.value }, group.current)} /></label>
    </section></details><details className="clip-tool-group"><summary>Letra y formato</summary><section className="clip-tool-section">
      <label className="field-label">Letra<select className="text-input" aria-label="Letra" value={style.font} onChange={e => styleChange({ font: e.target.value })}>{['Montserrat', 'Segoe UI', 'Arial', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Courier New'].map(font => <option key={font} value={font}>{font}</option>)}</select></label>
      <NumberField label="Tamaño de letra" unit="px" value={style.size} min={8} max={500} precision={0} slider onNotice={onNotice} onChange={(size, g, source) => !!styleChange({ size: snappedValue(size, 'size', source) }, g)} />
      <div className="text-design" aria-label="Diseño"><label className="tool-checkbox"><input type="checkbox" checked={!!style.bold} onChange={e => styleChange({ bold: e.target.checked })} />Negrita</label><label className="tool-checkbox"><input type="checkbox" checked={!!style.italic} onChange={e => styleChange({ italic: e.target.checked })} />Cursiva</label><label className="tool-checkbox"><input type="checkbox" checked={!!style.underline} onChange={e => styleChange({ underline: e.target.checked })} />Subrayado</label></div>
      <NumberField label="Opacidad" unit="%" value={(style.opacity ?? 1) * 100} min={0} max={100} precision={0} slider onNotice={onNotice} onChange={(value, g) => !!styleChange({ opacity: value / 100 }, g)} />
      <div className="layer-colors"><label>Color<input aria-label="Color del texto" type="color" value={style.color} onChange={e => styleChange({ color: e.target.value })} /></label></div>
      <label className="field-label">Alineación<select className="text-input" aria-label="Alineación del texto" value={style.align} onChange={e => styleChange({ align: e.target.value as TextStyle['align'] })}><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label>
    </section></details><details className="clip-tool-group"><summary>Fondo del texto</summary><section className="clip-tool-section">
      <label className="tool-checkbox"><input type="checkbox" checked={backgroundEnabled} onChange={e => styleChange({ bgEnabled: e.target.checked, ...(e.target.checked && !style.bgColor ? { bgColor: '#000000' } : {}), ...(e.target.checked && style.bgEnabled === undefined && !(style.bgOpacity ?? 0) ? { bgOpacity: 0.5 } : {}) })} />Fondo</label>
      {backgroundEnabled && <><div className="layer-colors"><label>Color del fondo<input aria-label="Color del fondo" type="color" value={style.bgColor ?? '#000000'} onChange={e => styleChange({ bgColor: e.target.value })} /></label></div><NumberField label="Opacidad del fondo" unit="%" value={(style.bgOpacity ?? 0) * 100} min={0} max={100} precision={0} slider onNotice={onNotice} onChange={(value, g) => !!styleChange({ bgOpacity: value / 100 }, g)} /></>}
    </section></details></>}
    <details className="clip-tool-group"><summary>Tiempo y pista</summary><section className="clip-tool-section">
      <div className="tool-field-pair">
        <NumberField label="Inicio" unit="s" value={item.start} min={0} max={100000000} step={0.1} onNotice={onNotice} onChange={(value, g) => move(value, item.track ?? 0, g)} />
        <NumberField label="Pista" value={(item.track ?? 0) + 1} min={1} max={1001} precision={0} onNotice={onNotice} onChange={(value, g) => move(item.start, value - 1, g)} />
      </div>
      {visual && visual.type !== 'video' ? <NumberField label="Duración" unit="s" value={visual.duration} min={1 / project.canvas.fps} max={100000000} step={0.1} onNotice={onNotice} onChange={(duration, g) => update({ duration }, g)} /> : <p className="layer-duration">Duración: {formatTime(currentDuration, true)}</p>}
    </section></details>
    {visual && <details className="clip-tool-group" open={visual.type !== 'text' ? true : undefined}><summary>Escala y posición</summary><section className="clip-tool-section">
      <NumberField label="Escala" unit="%" value={visual.scale * 100} min={10} max={1000} precision={0} slider onNotice={onNotice} onChange={(value, g, source) => update({ scale: snappedValue(value / 100, 'scale', source) }, g)} />
      {visual.type === 'text' && <button type="button" className="secondary-button" onClick={fitText}>Ajustar al video</button>}
      <div className="tool-field-pair"><NumberField label="Posición X" unit="px" value={visual.posX} min={-2 * project.canvas.w} max={2 * project.canvas.w} precision={0} onNotice={onNotice} onChange={(posX, g) => update({ posX }, g)} /><NumberField label="Posición Y" unit="px" value={visual.posY} min={-2 * project.canvas.h} max={2 * project.canvas.h} precision={0} onNotice={onNotice} onChange={(posY, g) => update({ posY }, g)} /></div>
    </section></details>}
    {(audio || visual?.type === 'video') && <details className="clip-tool-group" open={audio ? true : undefined}><summary>Velocidad y volumen</summary><section className="clip-tool-section">
      <NumberField label="Velocidad" unit="×" value={audio?.speed ?? visual?.speed ?? 1} min={0.25} max={4} step={0.05} onNotice={onNotice} onChange={(speed, g) => update({ speed }, g)} />
      <NumberField label="Volumen" unit="%" value={(audio?.volume ?? visual?.volume ?? 1) * 100} min={0} max={200} precision={0} slider onNotice={onNotice} onChange={(volume, g) => update({ volume: volume / 100 }, g)} />
      {(audio?.volume ?? visual?.volume ?? 1) > 1.5 && <p className="tool-volume-warning">Por encima de 150% puede haber distorsión.</p>}
    </section></details>}
  </div>;
}
