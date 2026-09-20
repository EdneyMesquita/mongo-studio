import { create } from "zustand";
import { applyTheme, getStoredTheme } from "../lib/themes";

interface ThemeState {
  themeId: string;
  setTheme: (themeId: string) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  themeId: getStoredTheme(),
  setTheme: (themeId) => {
    applyTheme(themeId);
    set({ themeId });
  },
}));
