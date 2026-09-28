import { lazy, memo, Suspense, useState } from "react";
import type { CollectionTab } from "../../store/sessionsStore";
import { useUiStore } from "../../store/uiStore";
import { cn } from "@/lib/utils";
import { QueryBar } from "../query/QueryBar";
import { DocumentResults } from "../results/DocumentResults";
import { IndexesPanel } from "../indexes/IndexesPanel";
import { ScriptConsole } from "../console/ScriptConsole";

// Loaded on first use: most sessions never open them.
const ExplainDialog = lazy(() =>
  import("../explain/ExplainDialog").then((m) => ({ default: m.ExplainDialog })),
);
const ExportDialog = lazy(() =>
  import("../export/ExportDialog").then((m) => ({ default: m.ExportDialog })),
);
import { CollectionToolbar } from "./CollectionToolbar";

interface CollectionTabViewProps {
  tab: CollectionTab;
  /** Only the active tab mounts its console (it owns global shortcuts). */
  active: boolean;
}

type ToolDialog = "explain" | "export" | null;

/**
 * Everything under a collection tab: its toolbar (Documents / Indexes /
 * Console) and the view picked there. Memoised: every open tab stays
 * mounted, and typing in one tab's query must not re-render the others.
 */
export const CollectionTabView = memo(function CollectionTabView({ tab, active }: CollectionTabViewProps) {
  const view = useUiStore((s) => s.mainTab);
  const setView = useUiStore((s) => s.setMainTab);
  const [dialog, setDialog] = useState<ToolDialog>(null);
  const closeDialog = () => setDialog(null);

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <CollectionToolbar
        view={view}
        onViewChange={setView}
        onExplain={() => setDialog("explain")}
        onExport={() => setDialog("export")}
      />
      {/* Documents stay mounted under the other views, so the results'
          scroll and expansion survive a trip to Indexes or Console. */}
      <div className={cn("flex min-h-0 flex-1 flex-col", view !== "browse" && "hidden")}>
        <QueryBar tab={tab} />
        <div className="min-h-0 flex-1">
          <DocumentResults tab={tab} />
        </div>
      </div>
      {active && view === "indexes" && (
        <div className="min-h-0 flex-1">
          <IndexesPanel tab={tab} />
        </div>
      )}
      {active && view === "console" && (
        <div className="min-h-0 flex-1">
          <ScriptConsole tab={tab} />
        </div>
      )}
      <Suspense fallback={null}>
        {dialog === "explain" && <ExplainDialog tab={tab} onClose={closeDialog} />}
        {dialog === "export" && <ExportDialog tab={tab} onClose={closeDialog} />}
      </Suspense>
    </div>
  );
});
