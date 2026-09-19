import type { ReactNode } from "react";

interface AppShellProps {
  sidebar?: ReactNode;
  statusBar?: ReactNode;
  children?: ReactNode;
}

export function AppShell({ sidebar, statusBar, children }: AppShellProps) {
  return (
    <div className="flex h-screen w-screen flex-col bg-editor text-text-default">
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-border-subtle bg-sidebar">
          {sidebar}
        </aside>
        <main className="min-w-0 flex-1 overflow-auto bg-editor">{children}</main>
      </div>
      <footer className="flex h-6 shrink-0 items-center border-t border-border-subtle bg-accent px-3 text-[11px] text-white">
        {statusBar}
      </footer>
    </div>
  );
}
