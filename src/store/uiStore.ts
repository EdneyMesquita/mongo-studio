import { create } from "zustand";

export type MainTab = "browse" | "indexes" | "console";

/** How query and script results are rendered: JSON tree, or Key/Value/Type table. */
export type ResultView = "tree" | "table";

interface UiState {
  mainTab: MainTab;
  setMainTab: (tab: MainTab) => void;
  resultView: ResultView;
  setResultView: (view: ResultView) => void;
}

export const useUiStore = create<UiState>((set) => ({
  mainTab: "browse",
  setMainTab: (tab) => set({ mainTab: tab }),
  resultView: "tree",
  setResultView: (view) => set({ resultView: view }),
}));
