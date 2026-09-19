export interface ThemeOption {
  id: string;
  name: string;
  swatch: string;
}

export const THEMES: ThemeOption[] = [
  { id: "compass", name: "Compass", swatch: "#3d1e35" },
  { id: "dark-modern", name: "Dark Modern", swatch: "#0e639c" },
  { id: "monokai", name: "Monokai", swatch: "#ae81ff" },
  { id: "dracula", name: "Dracula", swatch: "#bd93f9" },
  { id: "solarized-dark", name: "Solarized Dark", swatch: "#268bd2" },
];

const STORAGE_KEY = "mongo-studio-theme";
const DEFAULT_THEME = "compass";

export function getStoredTheme(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(themeId: string) {
  document.documentElement.dataset.theme = themeId;
  try {
    localStorage.setItem(STORAGE_KEY, themeId);
  } catch {
    // localStorage unavailable (private mode, etc.) - theme just won't persist
  }
}
