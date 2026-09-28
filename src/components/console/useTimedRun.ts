import { create } from "zustand";
import { currentConsoleTarget, useConsoleStore } from "../../store/consoleStore";

interface RunDurations {
  /** Milliseconds the last completed run of each console took, by tab id. */
  byKey: Record<string, number>;
}

const useRunDurations = create<RunDurations>(() => ({ byKey: {} }));

function setDuration(key: string, ms: number | null) {
  useRunDurations.setState((s) => {
    const byKey = { ...s.byKey };
    if (ms === null) delete byKey[key];
    else byKey[key] = ms;
    return { byKey };
  });
}

/**
 * Runs the console on screen, timing the call. Reads the target from the
 * stores at call time, so it suits callbacks bound once, like Monaco commands.
 */
export async function runCurrentConsole(): Promise<void> {
  const target = currentConsoleTarget();
  if (!target?.session) return;
  const { key } = target;
  setDuration(key, null);
  const started = performance.now();
  const store = useConsoleStore.getState();
  const running = store.run(key, target.session.sessionId, target.database, target.script);
  // run() marks the console as running before its first await.
  const executionId = useConsoleStore.getState().consoles[key]?.executionId;
  await running;
  // A run re-run or closed meanwhile is dropped, as the store drops it.
  const now = useConsoleStore.getState().consoles[key];
  if (now?.executionId === executionId && now.hasResult) {
    setDuration(key, performance.now() - started);
  }
}

/** How long the console's last completed run took, if it ran from here. */
export function useRunDuration(key: string): number | undefined {
  return useRunDurations((s) => s.byKey[key]);
}
