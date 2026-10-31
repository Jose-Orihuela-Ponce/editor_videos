import { describe, expect, it } from 'vitest';
import { snapToCenter } from './snapping';

describe('Imán al centro de la vista previa', () => {
  it('mantiene la misma distancia visual en cada tamaño y orientación', () => {
    for (const [canvas, preview] of [[1920, 480], [1080, 300], [1920, 640], [1080, 800]]) {
      expect(snapToCenter(5 * canvas / preview, canvas, preview, false)).toEqual({ position: 0, snapped: true });
      expect(snapToCenter(-5 * canvas / preview, canvas, preview, false).snapped).toBe(true);
      expect(snapToCenter(7 * canvas / preview, canvas, preview, false).snapped).toBe(false);
    }
  });
  it('retiene el centro sin vibrar, libera al alejarse y permite mover libremente con Alt', () => {
    expect(snapToCenter(5, 100, 100, false).snapped).toBe(true);
    expect(snapToCenter(10, 100, 100, true)).toEqual({ position: 0, snapped: true });
    expect(snapToCenter(13, 100, 100, true)).toEqual({ position: 13, snapped: false });
    expect(snapToCenter(8, 100, 100, false).snapped).toBe(false);
    expect(snapToCenter(3.4, 100, 100, true, true)).toEqual({ position: 3, snapped: false });
  });
});
