import { create } from 'zustand';

interface UIState {
  activePanel: string | null;
  closePanel: () => void;
  openPanel: (name: string) => void;
  togglePanel: (name: string) => void;
  user: string | null;
  token: string;
  setUser: (u: string | null) => void;
  setToken: (t: string) => void;
  downloadPanelOpen: boolean;
  setDownloadPanelOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activePanel: null,
  closePanel: () => set({ activePanel: null }),
  openPanel: (name) => set({ activePanel: name }),
  togglePanel: (name) => set((state) => ({ activePanel: state.activePanel === name ? null : name })),
  user: null,
  token: '',
  setUser: (u) => set({ user: u }),
  setToken: (t) => set({ token: t }),
  downloadPanelOpen: false,
  setDownloadPanelOpen: (open) => set({ downloadPanelOpen: open }),
}));
