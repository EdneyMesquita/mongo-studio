import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MainTab = "browse" | "indexes" | "console";

/** How query and script results are rendered: JSON tree, or Key/Value/Type table. */
export type ResultView = "tree" | "table";

/** The console's editor and output: side by side, or editor above output. */
export type ConsoleLayout = "side" | "stacked";

interface UiState {
  mainTab: MainTab;
  setMainTab: (tab: MainTab) => void;
  resultView: ResultView;
  setResultView: (view: ResultView) => void;
  consoleLayout: ConsoleLayout;
  setConsoleLayout: (layout: ConsoleLayout) => void;
  /** The editor's share of the console, remembered per layout. */
  consoleSplit: Record<ConsoleLayout, number>;
  setConsoleSplit: (layout: ConsoleLayout, ratio: number) => void;
}

export const DEFAULT_CONSOLE_SPLIT = 0.6;

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      mainTab: "browse",
      setMainTab: (tab) => set({ mainTab: tab }),
      resultView: "tree",
      setResultView: (view) => set({ resultView: view }),
      consoleLayout: "side",
      setConsoleLayout: (layout) => set({ consoleLayout: layout }),
      consoleSplit: { side: DEFAULT_CONSOLE_SPLIT, stacked: DEFAULT_CONSOLE_SPLIT },
      setConsoleSplit: (layout, ratio) =>
        set((s) => ({ consoleSplit: { ...s.consoleSplit, [layout]: ratio } })),
    }),
    {
      name: "mongo-studio-ui",
      // Only the console arrangement is a lasting preference; which tab is
      // open resets on launch as it always has.
      partialize: (s) => ({ consoleLayout: s.consoleLayout, consoleSplit: s.consoleSplit }),
    },
  ),
);
