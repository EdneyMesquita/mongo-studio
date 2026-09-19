import type { ReactNode } from "react";

interface AppShellProps {
  sidebar?: ReactNode;
  statusBar?: ReactNode;
  children?: ReactNode;
}

export function AppShell({ sidebar, statusBar, children }: AppShellProps) {
  return (
    <div className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100">
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-900">
          {sidebar}
        </aside>
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
      <footer className="flex h-7 shrink-0 items-center border-t border-neutral-800 bg-neutral-900 px-3 text-xs text-neutral-400">
        {statusBar}
      </footer>
    </div>
  );
}
