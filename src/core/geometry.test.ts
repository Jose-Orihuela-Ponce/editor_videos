import { describe, expect, it } from 'vitest';
import { calculateGeometry, validateGeometry } from './geometry';
import { makeClip } from './timeline';
import type { Media } from './project';

const media: Media = { id: 'm', kind: 'video', path: 'video.mp4', duration: 4, w: 320, h: 180, hasAudio: true };
describe('Geometría compartida entre vista previa y exportación', () => {
  it('recorta antes de encajar y escala cada eje desde el centro, con Y hacia abajo', () => {
    const clip = { ...makeClip(media, 0), crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, zoom: 0.5, stretchX: 1.2, stretchY: 0.8, posX: 100, posY: 50, flipH: true };
    const geometry = calculateGeometry(media, { w: 1920, h: 1080 }, clip);
    expect(geometry.crop).toEqual({ x: 80, y: 45, w: 160, h: 90 });
    expect(geometry.baseWidth).toBe(1920); expect(geometry.baseHeight).toBe(1080);
    expect(geometry.width).toBe(1152); expect(geometry.height).toBe(432);
    expect(geometry.left).toBe(484); expect(geometry.top).toBe(374);
  });
  it('encaja una fuente horizontal dentro de un lienzo vertical sin deformarla', () => {
    const geometry = calculateGeometry(media, { w: 1080, h: 1920 }, makeClip(media, 0));
    expect(geometry.width).toBe(1080); expect(geometry.height).toBe(607.5);
    expect(geometry.left).toBe(0); expect(geometry.top).toBe(656.25);
  });
  it('normaliza el recorte a límites de píxeles compartidos y rechaza geometría no renderizable', () => {
    const clip = makeClip(media, 0), canvas = { w: 1920, h: 1080 };
    expect(calculateGeometry(media, canvas, { ...clip, crop: { x: 0.101, y: 0.102, w: 0.501, h: 0.501 } }).crop).toEqual({ x: 32, y: 18, w: 161, h: 91 });
    for (const update of [{ zoom: NaN }, { zoom: 0 }, { stretchY: 11 }, { posX: 4000 }, { crop: { x: 0.9, y: 0, w: 0.2, h: 1 } }, { crop: { x: 0, y: 0, w: 0.001, h: 1 } }]) {
      expect(() => validateGeometry(media, canvas, { ...clip, ...update })).toThrow(/geometría/);
    }
  });
});
