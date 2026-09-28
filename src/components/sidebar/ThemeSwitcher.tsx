import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "../../store/themeStore";

/** Switches between the dark and the light version. */
export function ThemeSwitcher() {
  const themeId = useThemeStore((s) => s.themeId);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const label = themeId === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button type="button" className="btn-icon" onClick={toggleTheme} title={label} aria-label={label}>
      {themeId === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
