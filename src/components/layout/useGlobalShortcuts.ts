import { useEffect } from "react";
import { useUiStore } from "../../store/uiStore";
import { useAssistantStore } from "../../store/assistantStore";

/**
 * App-wide keys: Ctrl/Cmd+K quick open, Ctrl/Cmd+B the Explorer, Ctrl/Cmd+N
 * a new connection, Ctrl/Cmd+L the Assistant, Ctrl/Cmd+I ask it in place. Caught in the capture phase, before Monaco sees them:
 * it would otherwise swallow Ctrl+K as the start of one of its chords.
 */
/** Focuses an element once it has rendered (the panel loads on first open). */
function focusSoon(id: string, tries = 20) {
  const el = document.getElementById(id);
  if (el) el.focus();
  else if (tries > 0) window.setTimeout(() => focusSoon(id, tries - 1), 50);
}

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
      } else if (key === "l") {
        const assistant = useAssistantStore.getState();
        assistant.togglePanel();
        if (useAssistantStore.getState().panel === "chat") focusSoon("assistant-input");
      } else if (key === "i") {
        useAssistantStore.getState().askInline();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
