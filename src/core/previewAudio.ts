// One source node per media element, including React's development remounts.
interface AudioRoute { context: AudioContext; source: MediaElementAudioSourceNode; gain: GainNode; compressor: DynamicsCompressorNode }
const routes = new WeakMap<HTMLMediaElement, AudioRoute>();
let outputContext: AudioContext | undefined;
let outputCompressor: DynamicsCompressorNode | undefined;

export function previewAudio(element: HTMLMediaElement) {
  let route = routes.get(element);
  if (!route) {
    const context = outputContext ??= new AudioContext();
    if (!outputCompressor) {
      const compressor = context.createDynamicsCompressor();
      // Conservative peak protection; FFmpeg uses its own final limiter.
      compressor.threshold.value = -1; compressor.knee.value = 0;
      compressor.ratio.value = 20; compressor.attack.value = 0.003; compressor.release.value = 0.08;
      compressor.connect(context.destination); outputCompressor = compressor;
    }
    const compressor = outputCompressor;
    const source = context.createMediaElementSource(element), gain = context.createGain();
    source.connect(gain); gain.connect(compressor);
    route = { context, source, gain, compressor }; routes.set(element, route);
  }
  element.volume = 1;
  return {
    setVolume(volume: number) { route.gain.gain.value = Math.max(0, Math.min(2, volume)); },
    async resume() { if (route.context.state === 'suspended') await route.context.resume(); },
  };
}
