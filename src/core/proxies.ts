import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { desktop } from './api';
import type { Media } from './project';
interface ProxyState { paths: Record<string,string>; working: string[] }
export const useProxies = create<ProxyState>(() => ({ paths:{}, working:[] }));
const tasks = new Map<string,Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();
export const previewPath = (media: Media) => useProxies.getState().paths[media.path] ?? media.path;
export function ensureProxy(media: Media): Promise<string | null> {
  if (!desktop || media.kind !== 'video') return Promise.resolve(null);
  const ready = useProxies.getState().paths[media.path]; if (ready) return Promise.resolve(ready);
  const ongoing = tasks.get(media.path); if (ongoing) return ongoing;
  useProxies.setState(s => ({ working:[...s.working,media.path] }));
  const promise = queue.then(() => invoke<string>('prepare_proxy',{path:media.path})).then(path => { useProxies.setState(s=>({paths:{...s.paths,[media.path]:path}})); return path; }).catch(() => { tasks.delete(media.path); return null; }).finally(() => useProxies.setState(s=>({working:s.working.filter(p=>p!==media.path)})));
  queue = promise;
  tasks.set(media.path,promise); return promise;
}
