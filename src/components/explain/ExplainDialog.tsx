import { useId, useState } from "react";
import { Zap } from "lucide-react";
import { useConnectionsStore } from "../../store/connectionsStore";
import type { CollectionTab } from "../../store/sessionsStore";
import { api } from "../../lib/tauri";
import { summarizeExplain } from "../../lib/explain";
import type { ExplainVerbosity } from "../../types/explain";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { explainQueryOf } from "./explainQuery";
import { ExplainSummaryView } from "./ExplainSummaryView";

interface ExplainDialogProps {
  tab: CollectionTab;
  onClose: () => void;
}

const verbosityOptions: { id: ExplainVerbosity; label: string }[] = [
  { id: "query_planner", label: "Query planner" },
  { id: "execution_stats", label: "Execution stats" },
  { id: "all_plans_execution", label: "All plans execution" },
];

/** Explains the tab's current filter/sort or pipeline at a chosen verbosity. */
export function ExplainDialog({ tab, onClose }: ExplainDialogProps) {
  const session = useConnectionsStore((s) => s.sessions[tab.connection.id]);
  const { database, collection, mode } = tab;
  const [verbosity, setVerbosity] = useState<ExplainVerbosity>("execution_stats");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [showRaw, setShowRaw] = useState(false);
  const verbosityId = useId();
  const rawId = useId();

  if (!session || !database || !collection) return null;
  const sessionId = session.sessionId;

  async function handleRun() {
    setLoading(true);
    setError(null);
    setRaw(null);
    try {
      setRaw(await api.explainQuery(sessionId, database, collection, explainQueryOf(tab), verbosity));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const summary = raw !== null ? summarizeExplain(raw) : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Explain query</DialogTitle>
          <span className="truncate font-data text-fg-3">
            {database}.{collection}
          </span>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3.5">
          <DialogDescription>
            Explains the current {mode === "aggregate" ? "pipeline" : "filter and sort"}.
          </DialogDescription>
          <div className="flex items-center gap-2.5">
            <Label htmlFor={verbosityId}>Verbosity</Label>
            <Select
              value={verbosity}
              onValueChange={(value) => setVerbosity(value as ExplainVerbosity)}
              disabled={loading}
            >
              <SelectTrigger id={verbosityId} size="sm" className="min-w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {verbosityOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm break-words text-danger">{error}</p>}
          {summary && <ExplainSummaryView summary={summary} />}

          {raw !== null && (
            <div className="flex items-center gap-2">
              <Switch id={rawId} checked={showRaw} onCheckedChange={setShowRaw} />
              <Label htmlFor={rawId} className="font-normal text-fg-2">
                Raw explain output
              </Label>
            </div>
          )}
          {showRaw && raw !== null && (
            <pre className="max-h-80 min-h-24 overflow-auto rounded-md border border-line bg-panel px-3 py-2 font-data text-fg-2">
              {JSON.stringify(raw, null, 2)}
            </pre>
          )}
        </DialogBody>
        <DialogFooter className="justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" disabled={loading} onClick={handleRun}>
            <Zap />
            {loading ? "Running…" : "Run explain"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
