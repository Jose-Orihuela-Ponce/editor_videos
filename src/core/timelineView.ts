// Zoom is a view preference (0–100), independent of project data and clip scale.
export function timelineScale(duration: number, viewportWidth: number, zoom: number) {
  const span = Math.max(10, duration);
  const fit = Math.max(1, viewportWidth - 24) / span;
  const minimum = fit * 0.8;
  const maximum = Math.max(200, fit);
  const pixelsPerSecond = minimum * (maximum / minimum) ** (Math.max(0, Math.min(100, zoom)) / 100);
  return { span: Math.max(span, Math.max(1, viewportWidth - 24) / pixelsPerSecond), pixelsPerSecond, width: Math.max(viewportWidth, span * pixelsPerSecond + 24) };
}

export function zoomScrollLeft(time: number, offset: number, pixelsPerSecond: number, width: number, viewportWidth: number) {
  return Math.max(0, Math.min(Math.max(0, width - viewportWidth), time * pixelsPerSecond - offset));
}

export function rulerStep(pixelsPerSecond: number) {
  const target = Math.max(1, 80 / pixelsPerSecond);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].find(value => value * magnitude >= target)! * magnitude;
}
