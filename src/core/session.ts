import { create } from 'zustand';

// UI state never enters the saved document or its undo history.
interface Session {
  time: number; playing: boolean; loading: boolean; error: string;
  selectedId: string | null; zoom: number; exporting: boolean;
  fitGuide: { left: number; top: number; width: number; height: number } | null;
}
export const useSession = create<Session>(() => ({ time: 0, playing: false, loading: false, error: '', selectedId: null, zoom: 0, exporting: false, fitGuide: null }));
export const selectClip = (selectedId: string | null) => useSession.setState({ selectedId });
let fitTimer: ReturnType<typeof setTimeout> | undefined;
export function showFitGuide(rect: NonNullable<Session['fitGuide']>) {
  clearTimeout(fitTimer); useSession.setState({ fitGuide: rect });
  fitTimer = setTimeout(() => useSession.setState({ fitGuide: null }), 1000);
}
