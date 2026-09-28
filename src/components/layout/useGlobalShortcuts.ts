import { useEffect } from "react";
import { useUiStore } from "../../store/uiStore";

/**
 * App-wide keys: Ctrl/Cmd+K quick open, Ctrl/Cmd+B the Explorer, Ctrl/Cmd+N
 * a new connection. Caught in the capture phase, before Monaco sees them:
 * it would otherwise swallow Ctrl+K as the start of one of its chords.
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const ui = useUiStore.getState();
      // The connection dialog is modal; nothing opens over it.
      if (ui.connectionDialog) return;
      const key = e.key.toLowerCase();
      if (key === "k") ui.setPaletteOpen(!ui.paletteOpen);
      else if (key === "b") ui.toggleSidePanel("explorer");
      else if (key === "n") {
        ui.setPaletteOpen(false);
        ui.setConnectionDialog({ mode: "new" });
      } else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
