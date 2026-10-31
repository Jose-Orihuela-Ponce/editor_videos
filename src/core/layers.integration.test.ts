import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buildRenderPlan } from './export';
import { createEmptyProject } from './project';
import type { Media, Project } from './project';
import { appendMedia } from './timeline';
import { addAudioLayer, addVisualLayer, updateOverlay } from './layers';

const ffmpeg = resolve('src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe'), ffprobe = resolve('src-tauri/binaries/ffprobe-x86_64-pc-windows-msvc.exe');
const available = existsSync(ffmpeg) && existsSync(ffprobe), root = resolve('.local/layer-export-tests'), folder = join(root, crypto.randomUUID());
function run(args: string[]) { return execFileSync(ffmpeg, ['-v', 'error', '-nostdin', '-y', ...args], { windowsHide: true, timeout: 60000, maxBuffer: 12 * 1024 * 1024 }); }
function probe(path: string) { return JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path], { encoding: 'utf8', windowsHide: true })); }
function pixel(path: string, time: number, x: number, y: number) { return [...run(['-ss', String(time), '-i', path, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']).subarray(0, 3)]; }
function tone(path: string, time: number, frequency: number) {
  const data = run(['-ss', String(time), '-i', path, '-t', '0.2', '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']);
  let re = 0, im = 0; for (let i = 0; i + 3 < data.length; i += 4) { const x = data.readFloatLE(i), theta = 2 * Math.PI * frequency * i / 4 / 48000; re += x * Math.cos(theta); im += x * Math.sin(theta); }
  return 2 * Math.hypot(re, im) / (data.length / 4);
}
let red: Media, blue: Media, green: Media, music: Media, png: string;
function render(project: Project, format: 'mp4' | 'mp3', output: string) {
  const texts = project.overlays.filter(o => o.type === 'text').map(o => ({ id: o.id, data: `data:image/png;base64,${readFileSync(png).toString('base64')}` }));
  const plan = buildRenderPlan(project, { format, quality: '480' }, texts);
  const graph = join(folder, `${crypto.randomUUID()}.txt`); writeFileSync(graph, plan.graph);
  const inputs = plan.mediaIds.flatMap(id => ['-i', project.media.find(m => m.id === id)!.path]);
  for (const _ of plan.textImages ?? []) inputs.push('-i', png);
  run([...inputs, '-/filter_complex', graph, ...(format === 'mp4' ? ['-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac'] : ['-map', '[aout]', '-vn', '-c:a', 'libmp3lame', '-q:a', '2']), '-t', String(plan.duration), output]);
  return plan;
}
describe.skipIf(!available)('Exportación real de capas simultáneas', () => {
  beforeAll(() => {
    mkdirSync(folder, { recursive: true });
    const makeVideo = (color: string, freq: number, file: string) => run(['-f', 'lavfi', '-i', `color=c=${color}:s=320x180:r=24:d=4`, '-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=48000:duration=4`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(folder, file)]);
    makeVideo('red', 440, 'red.mp4'); makeVideo('blue', 660, 'blue.mp4');
    run(['-f', 'lavfi', '-i', 'color=c=lime:s=100x100:d=1', '-frames:v', '1', join(folder, 'green.png')]);
    run(['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=6', '-c:a', 'pcm_s16le', join(folder, 'music.wav')]);
    png = join(folder, 'text.png'); run(['-f', 'lavfi', '-i', 'color=c=black@0:s=854x480:d=1,format=rgba,drawbox=x=20:y=20:w=80:h=40:color=white@1:t=fill:replace=1', '-frames:v', '1', png]);
    red = { id: 'red', kind: 'video', path: join(folder, 'red.mp4'), duration: 4, w: 320, h: 180, fps: 24, hasAudio: true };
    blue = { id: 'blue', kind: 'video', path: join(folder, 'blue.mp4'), duration: 4, w: 320, h: 180, fps: 24, hasAudio: true };
    green = { id: 'green', kind: 'image', path: join(folder, 'green.png'), duration: 0, w: 100, h: 100, hasAudio: false };
    music = { id: 'music', kind: 'audio', path: join(folder, 'music.wav'), duration: 6, hasAudio: true };
  }, 60000);
  afterAll(() => { if (folder.startsWith(`${root}\\`) || folder.startsWith(`${root}/`)) rmSync(folder, { recursive: true, force: true }); });
  it('superpone video, imagen y texto; mezcla audio original, video y música y recorta solo la salida', () => {
    const p = createEmptyProject('Capas', 'horizontal'); appendMedia(p, [red]);
    const v = addVisualLayer(p, 1, blue); updateOverlay(p, v, { srcEnd: 2, speed: 2, volume: 1.5, scale: 0.5 });
    const i = addVisualLayer(p, 0.5, green); updateOverlay(p, i, { duration: 3, scale: 0.3, posX: -500 });
    const t = addVisualLayer(p, 1.25); updateOverlay(p, t, { duration: 1 });
    const musicId = addAudioLayer(p, 0.75, music); p.audio.find(a => a.id === musicId)!.speed = 0.5;
    const before = JSON.stringify(p), output = join(folder, 'layers.mp4'), plan = render(p, 'mp4', output), info = probe(output);
    expect(plan.duration).toBe(4); expect(Math.abs(Number(info.format.duration) - 4)).toBeLessThan(0.06); expect(JSON.stringify(p)).toBe(before);
    const early = pixel(output, 0.2, 427, 240), center = pixel(output, 1.5, 427, 240), later = pixel(output, 3.5, 427, 240), image = pixel(output, 1.5, 180, 240), text = pixel(output, 1.5, 40, 30);
    expect(early[0]).toBeGreaterThan(180); expect(center[2]).toBeGreaterThan(180); expect(later[0]).toBeGreaterThan(180); expect(image[1]).toBeGreaterThan(180); expect(Math.min(...text)).toBeGreaterThan(180);
    expect(tone(output, 0.2, 440)).toBeGreaterThan(0.03); expect(tone(output, 0.2, 880)).toBeLessThan(0.01);
    for (const frequency of [440, 660, 880]) expect(tone(output, 1.5, frequency)).toBeGreaterThan(0.03);
    expect(tone(output, 3.4, 660)).toBeLessThan(0.01); expect(tone(output, 3.4, 880)).toBeGreaterThan(0.03);
    const mp3 = join(folder, 'layers.mp3'); const audioPlan = render(p, 'mp3', mp3);
    expect(audioPlan.graph).not.toContain(':v]'); expect(Math.abs(Number(probe(mp3).format.duration) - 4)).toBeLessThan(0.1);
    for (const frequency of [440, 660, 880]) expect(tone(mp3, 1.5, frequency)).toBeGreaterThan(0.03);
  }, 60000);
  it('exporta sin video principal usando la duración de los elementos libres', () => {
    const p = createEmptyProject('Solo capas', 'horizontal'); const i = addVisualLayer(p, 0, green); updateOverlay(p, i, { duration: 2 });
    const a = addAudioLayer(p, 0.5, music); p.audio.find(x => x.id === a)!.srcEnd = 2;
    const output = join(folder, 'only-layers.mp4'), plan = render(p, 'mp4', output);
    expect(plan.duration).toBe(2.5); expect(Math.abs(Number(probe(output).format.duration) - 2.5)).toBeLessThan(0.06);
    expect(pixel(output, 1, 427, 240)[1]).toBeGreaterThan(180); expect(tone(output, 1, 880)).toBeGreaterThan(0.03);
    const mp3 = join(folder, 'only-audio.mp3'); render(p, 'mp3', mp3); expect(tone(mp3, 1, 880)).toBeGreaterThan(0.03);
  }, 60000);
  it('limita los picos de varias pistas sumadas antes de codificar', () => {
    const p = createEmptyProject('Mezcla', 'horizontal'); appendMedia(p, [red]);
    for (let i = 0; i < 5; i++) {
      const id = addAudioLayer(p, 0, music);
      p.audio.find(a => a.id === id)!.volume = 2;
    }
    const plan = buildRenderPlan(p, { format: 'mp3', quality: '480' });
    const graph = join(folder, 'limiter.txt'); writeFileSync(graph, plan.graph);
    const inputs = plan.mediaIds.flatMap(id => ['-i', p.media.find(m => m.id === id)!.path]);
    const samples = run([...inputs, '-/filter_complex', graph, '-map', '[aout]', '-t', '1', '-f', 'f32le', '-']);
    let peak = 0;
    for (let offset = 0; offset + 3 < samples.length; offset += 4) peak = Math.max(peak, Math.abs(samples.readFloatLE(offset)));
    expect(peak).toBeGreaterThan(0.9); expect(peak).toBeLessThanOrEqual(0.951);
  }, 60000);
});
