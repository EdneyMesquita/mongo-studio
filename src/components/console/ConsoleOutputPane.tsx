import { lazy, Suspense, useId, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import type { ConsoleSession } from "../../store/consoleStore";
import { ConsoleOutput } from "./ConsoleOutput";
import { ConsoleLogs } from "./ConsoleLogs";
import { ConsoleOutputTabs } from "./ConsoleOutputTabs";
import type { OutputTab, OutputTabOption } from "./ConsoleOutputTabs";
import { ConsoleRunState } from "./ConsoleRunState";
import { ResultViewToggle } from "../json/ResultViewToggle";

const ExportDialog = lazy(() =>
  import("../export/ExportDialog").then((m) => ({ default: m.ExportDialog })),
);

interface ConsoleOutputPaneProps {
  session: ConsoleSession | undefined;
  /** The last completed run's duration, when it was timed. */
  durationMs?: number;
  /** Where the result comes from, for the export dialog, e.g. "shop console". */
  exportLabel: string;
  /** File name the export suggests, without extension. */
  exportName: string;
}

/** The console's output: Result and Logs tabs over the run's state. */
export function ConsoleOutputPane({ session, durationMs, exportLabel, exportName }: ConsoleOutputPaneProps) {
  const [tab, setTab] = useState<OutputTab>("result");
  const [exporting, setExporting] = useState(false);
  const idPrefix = useId();
  const running = session?.running ?? false;
  const hasResult = session?.hasResult ?? false;
  const error = session?.error ?? null;
  const logs = session?.logs;
  const ran = running || hasResult || error !== null;

  // Logs have a tab of their own; the Result tab gets the session without
  // them so they don't show twice.
  const resultSession = useMemo(
    () => (session && session.logs.length > 0 ? { ...session, logs: [] } : session),
    [session],
  );

  const tabs: OutputTabOption[] = [
    {
      id: "result",
      label: "Result",
      count: hasResult && Array.isArray(session?.result) ? session.result.length : undefined,
    },
    { id: "logs", label: "Logs", count: ran && logs ? logs.length : undefined },
  ];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-editor">
      <div className="flex h-[34px] shrink-0 items-center gap-2 border-b border-line-soft pr-2.5 pl-1.5">
        <ConsoleOutputTabs tabs={tabs} value={tab} onChange={setTab} idPrefix={idPrefix} />
        <span className="flex-1" />
        {/* ConsoleOutput follows the shared result view but has no switch
            of its own yet. */}
        {tab === "result" && hasResult && <ResultViewToggle />}
        {hasResult && !running && (
          <Button variant="ghost" size="sm" onClick={() => setExporting(true)} title="Export the result to CSV or JSON">
            <Download />
            Export
          </Button>
        )}
        <ConsoleRunState
          running={running}
          failed={!running && error !== null}
          completed={!running && hasResult}
          durationMs={durationMs}
        />
      </div>
      <div
        role="tabpanel"
        id={`${idPrefix}-panel`}
        aria-labelledby={`${idPrefix}-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {!ran ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-fg-3">
            <p className="flex flex-wrap items-center justify-center gap-1.5">
              Run the script to see its result here.
              <span className="inline-flex gap-1">
                <Kbd>Ctrl</Kbd>
                <Kbd>Enter</Kbd>
              </span>
            </p>
          </div>
        ) : tab === "logs" ? (
          <ConsoleLogs logs={logs ?? []} />
        ) : (
          <ConsoleOutput session={resultSession} />
        )}
      </div>
      {exporting && session?.hasResult && (
        <Suspense fallback={null}>
          <ExportDialog
            target={{ kind: "result", value: session.result, label: exportLabel, baseName: exportName }}
            onClose={() => setExporting(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
