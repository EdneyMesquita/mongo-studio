import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

interface ConsoleRunStateProps {
  running: boolean;
  failed: boolean;
  completed: boolean;
  /** Milliseconds, when the run was timed. */
  durationMs?: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

/** The last run's state, at the right of the output header. */
export function ConsoleRunState({ running, failed, completed, durationMs }: ConsoleRunStateProps) {
  let content = null;
  if (running) {
    content = (
      <>
        <LoaderCircle className="size-3 animate-spin" aria-hidden />
        Running…
      </>
    );
  } else if (failed) {
    content = (
      <>
        <CircleAlert className="size-3 text-danger" aria-hidden />
        Failed
      </>
    );
  } else if (completed) {
    content = (
      <>
        <CircleCheck className="size-3 text-ok" aria-hidden />
        {durationMs === undefined ? "Completed" : `Completed in ${formatDuration(durationMs)}`}
      </>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5 text-sm text-fg-2" role="status">
      {content}
    </span>
  );
}
