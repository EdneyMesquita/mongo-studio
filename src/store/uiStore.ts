import { create } from "zustand";

export type MainTab = "browse" | "indexes" | "console";

interface UiState {
  mainTab: MainTab;
  setMainTab: (tab: MainTab) => void;
}

export const useUiStore = create<UiState>((set) => ({
  mainTab: "browse",
  setMainTab: (tab) => set({ mainTab: tab }),
}));
