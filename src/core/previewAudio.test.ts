import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const contexts: FakeAudioContext[] = [];
class FakeAudioContext {
  state = 'suspended';
  destination = {};
  sources: { element: HTMLMediaElement; connect: ReturnType<typeof vi.fn> }[] = [];
  gains: { gain: { value: number }; connect: ReturnType<typeof vi.fn> }[] = [];
  compressors: { threshold: { value: number }; knee: { value: number }; ratio: { value: number }; attack: { value: number }; release: { value: number }; connect: ReturnType<typeof vi.fn> }[] = [];
  constructor() { contexts.push(this); }
  resume = vi.fn(async () => { this.state = 'running'; });
  createMediaElementSource(element: HTMLMediaElement) {
    const source = { element, connect: vi.fn() }; this.sources.push(source); return source;
  }
  createGain() {
    const gain = { gain: { value: 1 }, connect: vi.fn() }; this.gains.push(gain); return gain;
  }
  createDynamicsCompressor() {
    const compressor = { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: vi.fn() };
    this.compressors.push(compressor); return compressor;
  }
}

beforeEach(() => { vi.resetModules(); contexts.length = 0; vi.stubGlobal('AudioContext', FakeAudioContext); });
afterEach(() => vi.unstubAllGlobals());

describe('Audio de vista previa', () => {
  it('reutiliza la fuente del mismo elemento al remontar y conecta todas las ganancias a una única salida protegida', async () => {
    const { previewAudio } = await import('./previewAudio');
    const first = { volume: 0.4 } as HTMLMediaElement;
    const second = { volume: 0.3 } as HTMLMediaElement;
    const original = previewAudio(first);
    const remounted = previewAudio(first);
    const other = previewAudio(second);
    expect(contexts).toHaveLength(1);
    const context = contexts[0];
    expect(context.sources).toHaveLength(2);
    expect(context.gains).toHaveLength(2);
    expect(context.compressors).toHaveLength(1);
    const compressor = context.compressors[0];
    expect(compressor.connect).toHaveBeenCalledExactlyOnceWith(context.destination);
    expect(context.sources[0].connect).toHaveBeenCalledExactlyOnceWith(context.gains[0]);
    expect(context.sources[1].connect).toHaveBeenCalledExactlyOnceWith(context.gains[1]);
    expect(context.gains.every(gain => gain.connect.mock.calls[0][0] === compressor)).toBe(true);
    expect(compressor.threshold.value).toBe(-1);
    expect(compressor.ratio.value).toBe(20);
    expect(first.volume).toBe(1);
    expect(second.volume).toBe(1);
    original.setVolume(1.8); expect(context.gains[0].gain.value).toBe(1.8);
    remounted.setVolume(0.5); expect(context.gains[0].gain.value).toBe(0.5);
    other.setVolume(0); expect(context.gains[1].gain.value).toBe(0);
  });

  it('aplica 200% mediante ganancia y reanuda el contexto suspendido solo cuando es necesario', async () => {
    const { previewAudio } = await import('./previewAudio');
    const element = { volume: 0.7 } as HTMLMediaElement;
    const route = previewAudio(element);
    route.setVolume(2);
    expect(element.volume).toBe(1);
    expect(contexts[0].gains[0].gain.value).toBe(2);
    route.setVolume(3); expect(contexts[0].gains[0].gain.value).toBe(2);
    route.setVolume(-1); expect(contexts[0].gains[0].gain.value).toBe(0);
    await route.resume(); await route.resume();
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
    contexts[0].state = 'suspended';
    await route.resume();
    expect(contexts[0].resume).toHaveBeenCalledTimes(2);
  });
});
