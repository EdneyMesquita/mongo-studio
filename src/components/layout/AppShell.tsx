import { useEffect } from "react";
import type { ReactNode } from "react";
import { useUiStore } from "../../store/uiStore";
import { SidebarResizer, clampSidebarWidth } from "./SidebarResizer";

interface AppShellProps {
  sidebar?: ReactNode;
  statusBar?: ReactNode;
  children?: ReactNode;
}

export function AppShell({ sidebar, statusBar, children }: AppShellProps) {
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);

  // A width saved on a bigger screen, or a window shrunk since, mustn't
  // leave the sidebar taking over the main area.
  useEffect(() => {
    function fit() {
      const { sidebarWidth: width, setSidebarWidth } = useUiStore.getState();
      const fitted = clampSidebarWidth(width);
      if (fitted !== width) setSidebarWidth(fitted);
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col bg-editor text-text-default">
      <div className="flex min-h-0 flex-1">
        <aside
          className="relative shrink-0 border-r border-border-subtle bg-sidebar"
          style={{ width: sidebarWidth }}
        >
          <div className="h-full overflow-y-auto">{sidebar}</div>
          <SidebarResizer />
        </aside>
        <main className="min-w-0 flex-1 overflow-auto bg-editor">{children}</main>
      </div>
      <footer className="flex h-6 shrink-0 items-center border-t border-border-subtle bg-accent px-3 text-[11px] text-white">
        {statusBar}
      </footer>
    </div>
  );
}
