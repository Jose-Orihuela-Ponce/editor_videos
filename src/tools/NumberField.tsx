import { useEffect, useRef, useState } from 'react';

interface Props {
  id?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  precision?: number;
  unit?: string;
  slider?: boolean;
  onChange: (value: number, group: string, source: 'field' | 'slider') => boolean;
  onNotice: (text: string, error?: boolean) => void;
}
/** Text drafts remain local until valid; one focus or slider gesture is one undo. */
export default function NumberField({ id, label, value, min, max, step = 1, precision = 4, unit, slider, onChange, onNotice }: Props) {
  const display = (number: number) => String(Number(number.toFixed(precision)));
  const [text, setText] = useState(display(value));
  const [invalid, setInvalid] = useState(false);
  const group = useRef('');
  const cancelBlur = useRef(false);
  useEffect(() => { setText(display(value)); setInvalid(false); }, [value, precision]);
  function begin() { group.current = crypto.randomUUID(); }
  function change(raw: string, source: 'field' | 'slider' = 'field') {
    const parsed = raw.trim() ? Number(raw) : NaN;
    const next = precision === 0 ? Math.round(parsed) : parsed;
    setText(precision === 0 && Number.isFinite(next) ? display(next) : raw);
    const valid = Number.isFinite(next) && next >= min - 1e-8 && next <= max + 1e-8;
    setInvalid(!valid);
    if (valid) {
      if (!group.current) begin();
      if (!onChange(Math.max(min, Math.min(max, next)), group.current, source)) {
        setText(display(value)); setInvalid(false);
      }
    }
  }
  function finish() {
    if (invalid && !cancelBlur.current) {
      onNotice(`${label}: introduce un valor entre ${display(min)} y ${display(max)}${unit ? ` ${unit}` : ''}.`, true);
      setText(display(value)); setInvalid(false);
    }
    cancelBlur.current = false;
    group.current = '';
  }
  return <label className="tool-number-field" htmlFor={id}>
    <span>{label}</span><span className="tool-number-input"><input id={id} type="number" min={min} max={max} step={step} value={text} aria-label={label} aria-invalid={invalid || undefined} onFocus={begin} onChange={event => change(event.target.value)} onBlur={finish} onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape') { cancelBlur.current = true; setText(display(value)); setInvalid(false); event.currentTarget.blur(); }
    }} />{unit && <small>{unit}</small>}</span>
    {slider && <input className="tool-range" type="range" aria-label={`${label} con deslizador`} min={min} max={max} step={step} value={Math.max(min, Math.min(max, value))} onFocus={begin} onPointerDown={begin} onKeyDown={event => { if (!event.repeat) begin(); }} onChange={event => change(event.target.value, 'slider')} onPointerUp={() => { group.current = ''; }} onPointerCancel={() => { group.current = ''; }} onBlur={finish} />}
  </label>;
}
