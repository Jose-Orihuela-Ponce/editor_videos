import { FlipHorizontal2, FlipVertical2 } from 'lucide-react';
import type { ClipTool, ToolContext } from '../types';
import { exportFlip, previewFlip } from './effects';

function FlipButtons({ clip, update }: ToolContext) {
  return <><button className={`icon-button ${clip.flipH ? 'active' : ''}`} type="button" aria-label="Espejo horizontal" aria-pressed={clip.flipH} title="Espejo horizontal" onClick={() => update({ flipH: !clip.flipH })}><FlipHorizontal2 size={16} /></button><button className={`icon-button ${clip.flipV ? 'active' : ''}`} type="button" aria-label="Espejo vertical" aria-pressed={clip.flipV} title="Espejo vertical" onClick={() => update({ flipV: !clip.flipV })}><FlipVertical2 size={16} /></button></>;
}
function FlipPanel(props: ToolContext) {
  return <section className="clip-tool-section"><h3>Espejo</h3><div className="tool-flip-buttons"><label><input type="checkbox" checked={props.clip.flipH} onChange={event => props.update({ flipH: event.target.checked })} /><FlipHorizontal2 size={14} />Horizontal</label><label><input type="checkbox" checked={props.clip.flipV} onChange={event => props.update({ flipV: event.target.checked })} /><FlipVertical2 size={14} />Vertical</label></div></section>;
}
export const flipTool: ClipTool = { id: 'flip', label: 'Espejo', scope: 'clip', inPreset: true, defaults: { flipH: false, flipV: false }, Panel: FlipPanel, ToolbarButton: FlipButtons,
  applyPreview: settings => ({ flip: previewFlip(settings) }), exportFilter: settings => ({ video: exportFlip(settings) }),
};
