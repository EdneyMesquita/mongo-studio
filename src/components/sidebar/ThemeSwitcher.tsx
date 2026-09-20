import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { THEMES } from "../../lib/themes";
import { useThemeStore } from "../../store/themeStore";

export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const { themeId, setTheme } = useThemeStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(id: string) {
    setTheme(id);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="rounded p-1.5 text-text-muted hover:bg-sidebar-hover hover:text-text-default"
        onClick={() => setOpen((o) => !o)}
        title="Color theme"
      >
        <Palette size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded border border-border-subtle bg-panel py-1 shadow-xl">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-default hover:bg-panel-hover"
              onClick={() => pick(theme.id)}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/10"
                style={{ backgroundColor: theme.swatch }}
              />
              <span className="flex-1 truncate">{theme.name}</span>
              {themeId === theme.id && (
                <Check size={13} className="shrink-0 text-text-muted" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
