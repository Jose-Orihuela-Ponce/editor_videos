import { describe, expect, it } from 'vitest';
import { rulerStep, timelineScale, zoomScrollLeft } from './timelineView';

describe('Zoom de la línea de tiempo', () => {
  it('permite contraer un 20% más allá del encaje, desde proyectos vacíos hasta montajes de varios días', () => {
    for (const width of [330, 1100]) for (const duration of [0, 7, 3600, 172800]) {
      const view = timelineScale(duration, width, 0);
      expect(view.width).toBeCloseTo(width);
      expect(Math.max(10, duration) * view.pixelsPerSecond).toBeCloseTo((width - 24) * 0.8);
      expect(view.span).toBeCloseTo(Math.max(10, duration) * 1.25);
    }
  });

  it('sigue encajando al añadir clips o cambiar el tamaño de la ventana', () => {
    expect(timelineScale(7200, 600, 0).pixelsPerSecond).toBeLessThan(timelineScale(1800, 600, 0).pixelsPerSecond);
    expect(timelineScale(7200, 900, 0).width).toBeCloseTo(900);
    expect(timelineScale(7200, 600, 100).pixelsPerSecond).toBeCloseTo(200);
    expect(timelineScale(7200, 600, 50).pixelsPerSecond).toBeGreaterThan(timelineScale(7200, 600, 0).pixelsPerSecond);
  });

  it('mantiene el tiempo bajo el cursor al acercar y vuelve al inicio al encajar', () => {
    const view = timelineScale(3600, 800, 60), time = 1800, offset = 240;
    const left = zoomScrollLeft(time, offset, view.pixelsPerSecond, view.width, 800);
    expect((left + offset) / view.pixelsPerSecond).toBeCloseTo(time);
    const fit = timelineScale(3600, 800, 0);
    expect(zoomScrollLeft(time, offset, fit.pixelsPerSecond, fit.width, 800)).toBeCloseTo(0);
  });

  it('mantiene las marcas legibles incluso en montajes largos', () => {
    for (const scale of [0.002, 0.1, 3, 55, 200]) expect(rulerStep(scale) * scale).toBeGreaterThanOrEqual(80);
  });
});
