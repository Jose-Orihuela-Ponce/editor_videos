import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buildRenderPlan } from './export';
import { createEmptyProject } from './project';
import { makeClip } from './timeline';
import { calculateGeometry } from './geometry';
import type { Media, Project } from './project';

const binaries = resolve('src-tauri/binaries');
const ffmpeg = join(binaries, 'ffmpeg-x86_64-pc-windows-msvc.exe'), ffprobe = join(binaries, 'ffprobe-x86_64-pc-windows-msvc.exe');
const available = existsSync(ffmpeg) && existsSync(ffprobe);
const testRoot = resolve('.local/export-tests'), folder = join(testRoot, crypto.randomUUID());
let project: Project;
function run(args: string[]) { return execFileSync(ffmpeg, ['-v', 'error', '-nostdin', '-y', ...args], { windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 45000 }); }
function probe(path: string) { return JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8', windowsHide: true })); }
function pixel(path: string, at: number, x: number, y: number) { return [...run(['-ss', String(at), '-i', path, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']).subarray(0, 3)]; }
function rms(path: string, at: number) { const data = run(['-ss', String(at), '-i', path, '-t', '0.15', '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']); let sum = 0; for (let i = 0; i + 3 < data.length; i += 4) sum += data.readFloatLE(i) ** 2; return Math.sqrt(sum / (data.length / 4)); }
function frequency(path: string, at: number) { const data = run(['-ss', String(at), '-i', path, '-t', '0.15', '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']); let crossings = 0; for (let i = 4; i + 3 < data.length; i += 4) if (data.readFloatLE(i - 4) <= 0 && data.readFloatLE(i) > 0) crossings++; return crossings / (data.length / 4 / 48000); }
describe.skipIf(!available)('Exportación real con FFmpeg: dos fuentes, hueco y audio ausente', () => {
  beforeAll(() => {
    mkdirSync(folder, { recursive: true });
    const aPath = join(folder, 'rojo con audio.mp4'), bPath = join(folder, 'azul sin audio.mp4');
    run(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=24:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=32000:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', aPath]);
    run(['-f', 'lavfi', '-i', 'color=c=blue:s=180x320:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', bPath]);
    run(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=24:d=2,drawbox=x=160:y=0:w=160:h=90:color=lime:t=fill,drawbox=x=0:y=90:w=160:h=90:color=blue:t=fill,drawbox=x=160:y=90:w=160:h=90:color=yellow:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(folder, 'quadrants.mp4')]);
    const a: Media = { id: 'a', kind: 'video', path: aPath, duration: 2, w: 320, h: 180, fps: 24, hasAudio: true };
    const b: Media = { id: 'b', kind: 'video', path: bPath, duration: 2, w: 180, h: 320, fps: 30, hasAudio: false };
    project = createEmptyProject('Dos fuentes', 'vertical'); project.autoJoin = false; project.media = [a, b];
    project.main = [{ ...makeClip(a, 0), srcStart: 0.5, srcEnd: 1.5 }, { ...makeClip(b, 1.5), srcStart: 0.25, srcEnd: 1.75 }];
  }, 45000);
  afterAll(() => { if (folder.startsWith(`${testRoot}\\`) || folder.startsWith(`${testRoot}/`)) rmSync(folder, { recursive: true, force: true }); });
  it('MP4 conserva duración, encuadre, colores, silencio del hueco y FPS del primer clip', () => {
    const plan = buildRenderPlan(project, { format: 'mp4', quality: '480' });
    const graph = join(folder, 'video.txt'), output = join(folder, 'resultado.mp4'); writeFileSync(graph, plan.graph);
    run(['-i', project.media[0].path, '-i', project.media[1].path, '-/filter_complex', graph, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-t', String(plan.duration), output]);
    const info = probe(output), video = info.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
    expect(Math.abs(Number(info.format.duration) - 3)).toBeLessThan(1 / 24 + 0.015);
    expect(video.width).toBe(480); expect(video.height).toBeGreaterThanOrEqual(850); expect(video.height).toBeLessThanOrEqual(856);
    expect(video.avg_frame_rate).toBe('24/1');
    const red = pixel(output, 0.5, 240, 420), gap = pixel(output, 1.25, 240, 420), blue = pixel(output, 2.25, 240, 420), border = pixel(output, 0.5, 240, 20);
    expect(red[0]).toBeGreaterThan(180); expect(red[2]).toBeLessThan(40);
    expect(blue[2]).toBeGreaterThan(180); expect(blue[0]).toBeLessThan(40);
    expect(Math.max(...gap, ...border)).toBeLessThan(20);
    expect(rms(output, 0.5)).toBeGreaterThan(0.015); expect(rms(output, 1.25)).toBeLessThan(0.001); expect(rms(output, 2.25)).toBeLessThan(0.001);
  }, 45000);
  it('MP3 exporta solo audio y respeta recortes y silencios con la misma duración', () => {
    const plan = buildRenderPlan(project, { format: 'mp3', quality: 'original' });
    expect(plan.videoLabel).toBeNull(); expect(plan.graph).not.toContain(':v]');
    const graph = join(folder, 'audio.txt'), output = join(folder, 'resultado.mp3'); writeFileSync(graph, plan.graph);
    run(['-i', project.media[0].path, '-i', project.media[1].path, '-/filter_complex', graph, '-map', '[aout]', '-vn', '-c:a', 'libmp3lame', '-q:a', '2', '-t', String(plan.duration), output]);
    const info = probe(output);
    expect(info.streams.every((s: { codec_type: string }) => s.codec_type === 'audio')).toBe(true);
    expect(Math.abs(Number(info.format.duration) - 3)).toBeLessThan(0.1);
    expect(rms(output, 0.5)).toBeGreaterThan(0.015); expect(rms(output, 2.25)).toBeLessThan(0.001);
  }, 45000);
  it('reutiliza una fuente dividida sin perder audio ni dejar salidas de filtros sin conectar', () => {
    const source = structuredClone(project); source.autoJoin = true;
    source.main = [{ ...source.main[0], srcStart: 0, srcEnd: 1 }, { ...source.main[0], id: 'right', start: 1, srcStart: 1, srcEnd: 2 }];
    const plan = buildRenderPlan(source, { format: 'mp4', quality: '480' });
    const graph = join(folder, 'split.txt'), output = join(folder, 'split.mp4'); writeFileSync(graph, plan.graph);
    run(['-i', source.media[0].path, '-/filter_complex', graph, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-t', String(plan.duration), output]);
    expect(Math.abs(Number(probe(output).format.duration) - 2)).toBeLessThan(0.05); expect(rms(output, 1.5)).toBeGreaterThan(0.015);
  }, 45000);
  it.each(['horizontal', 'vertical'] as const)('crop, espejos, escala y posición coinciden con la geometría de vista previa en %s', orientation => {
    const source = createEmptyProject('Transformaciones', orientation);
    const media: Media = { ...project.media[0], path: join(folder, 'quadrants.mp4'), hasAudio: false };
    source.media = [media];
    source.main = [{ ...makeClip(media, 0), srcStart: 0.25, srcEnd: 1.25, crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, flipH: true, flipV: true,
      zoom: orientation === 'horizontal' ? 0.6 : 1.5, stretchX: orientation === 'horizontal' ? 1.2 : 0.8, stretchY: orientation === 'horizontal' ? 0.8 : 1.2,
      posX: orientation === 'horizontal' ? 100 : -100, posY: orientation === 'horizontal' ? 100 : 250 }];
    const plan = buildRenderPlan(source, { format: 'mp4', quality: '480' });
    const graph = join(folder, `${orientation}.txt`), output = join(folder, `${orientation}.mp4`); writeFileSync(graph, plan.graph);
    run(['-i', media.path, '-/filter_complex', graph, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-c:a', 'aac', '-t', String(plan.duration), output]);
    const geometry = calculateGeometry(media, source.canvas, source.main[0]), factor = plan.width / source.canvas.w;
    const sample = (u: number, v: number) => pixel(output, 0.5, Math.round((geometry.left + geometry.width * u) * factor), Math.round((geometry.top + geometry.height * v) * factor));
    const yellow = sample(0.25, 0.25), blue = sample(0.75, 0.25), green = sample(0.25, 0.75), red = sample(0.75, 0.75);
    expect(yellow[0]).toBeGreaterThan(180); expect(yellow[1]).toBeGreaterThan(180); expect(yellow[2]).toBeLessThan(50);
    expect(blue[2]).toBeGreaterThan(180); expect(blue[0]).toBeLessThan(50);
    expect(green[1]).toBeGreaterThan(180); expect(green[0]).toBeLessThan(50);
    expect(red[0]).toBeGreaterThan(180); expect(red[1]).toBeLessThan(50);
    expect(Math.max(...pixel(output, 0.5, Math.round(plan.width / 2), 5))).toBeLessThan(20);
    expect(Math.abs(Number(probe(output).format.duration) - 1)).toBeLessThan(0.06);
  }, 45000);
  it('velocidades 0.25× y 4× conservan el último fotograma, duración y volumen 50%/200%', () => {
    const source = createEmptyProject('Velocidad y volumen', 'horizontal'); source.media = [project.media[0]];
    const media = source.media[0];
    source.main = [{ ...makeClip(media, 0), srcStart: 0.5, srcEnd: 1.5, speed: 0.25, volume: 0.5 }, { ...makeClip(media, 4), srcStart: 0.5, srcEnd: 1.5, speed: 4, volume: 2 }];
    const plan = buildRenderPlan(source, { format: 'mp4', quality: '480' });
    const graph = join(folder, 'speed.txt'), output = join(folder, 'speed.mp4'); writeFileSync(graph, plan.graph);
    run(['-i', media.path, '-/filter_complex', graph, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-t', String(plan.duration), output]);
    expect(plan.duration).toBe(4.25); expect(Math.abs(Number(probe(output).format.duration) - 4.25)).toBeLessThan(0.06);
    expect(pixel(output, 3.9, 300, 200)[0]).toBeGreaterThan(180); expect(pixel(output, 4.15, 300, 200)[0]).toBeGreaterThan(180);
    expect(rms(output, 4.03) / rms(output, 1)).toBeGreaterThan(3.6); expect(rms(output, 4.03) / rms(output, 1)).toBeLessThan(4.4);
    expect(Math.abs(frequency(output, 1) - 440)).toBeLessThan(30); expect(Math.abs(frequency(output, 4.03) - 440)).toBeLessThan(30);
    const audio = buildRenderPlan(source, { format: 'mp3', quality: '480' }); expect(audio.graph).not.toContain('crop='); expect(audio.graph).not.toContain('overlay=');
  }, 45000);
});
