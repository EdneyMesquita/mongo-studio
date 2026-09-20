export interface ThemeOption {
  id: string;
  name: string;
  swatch: string;
  isLight: boolean;
}

export const THEMES: ThemeOption[] = [
  { id: "compass", name: "Compass", swatch: "#3d1e35", isLight: false },
  { id: "dark-modern", name: "Dark Modern", swatch: "#0e639c", isLight: false },
  { id: "monokai", name: "Monokai", swatch: "#ae81ff", isLight: false },
  { id: "dracula", name: "Dracula", swatch: "#bd93f9", isLight: false },
  { id: "solarized-dark", name: "Solarized Dark", swatch: "#268bd2", isLight: false },
  { id: "light", name: "Light", swatch: "#0066b8", isLight: true },
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

export function isLightTheme(themeId: string): boolean {
  return THEMES.find((t) => t.id === themeId)?.isLight ?? false;
}
