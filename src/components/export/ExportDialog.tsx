import { useId, useState } from "react";
import { Download } from "lucide-react";
import { useConnectionsStore } from "../../store/connectionsStore";
import type { CollectionTab } from "../../store/sessionsStore";
import { useExportStore } from "../../store/exportStore";
import type { ExportNestedMode } from "../../types/export";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { exportQueryOf } from "./exportQuery";

interface ExportDialogProps {
  tab: CollectionTab;
  onClose: () => void;
}

const nestedOptions: { id: ExportNestedMode; label: string }[] = [
  { id: "flatten", label: "Flatten into columns (address.city, items.0.sku)" },
  { id: "stringify", label: "Keep as JSON text in one column" },
];

/** Streams the tab's whole query (not just the page shown) to a CSV file. */
export function ExportDialog({ tab, onClose }: ExportDialogProps) {
  const session = useConnectionsStore((st) => st.sessions[tab.connection.id]);
  const { database, collection, mode, limit } = tab;
  const { running, rowsWritten, summary, error, start, cancel, reset } = useExportStore();
  const [nestedMode, setNestedMode] = useState<ExportNestedMode>("flatten");
  const [capToLimit, setCapToLimit] = useState(false);
  const nestedId = useId();
  const capId = useId();

  if (!session || !database || !collection) return null;
  const sessionId = session.sessionId;

  async function handleExport() {
    let query;
    try {
      query = exportQueryOf(tab, capToLimit);
    } catch {
      useExportStore.setState({ error: "Current filter/pipeline is not valid JSON" });
      return;
    }
    await start(sessionId, database, collection, query, nestedMode, `${collection}.csv`);
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    // A running export only stops through Cancel; the dialog stays up until then.
    <Dialog open onOpenChange={(open) => !open && !running && handleClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton={!running}>
        <DialogHeader>
          <DialogTitle>Export to CSV</DialogTitle>
          <span className="truncate font-data text-fg-3">
            {database}.{collection}
          </span>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <DialogDescription>
            Exports the current {mode === "aggregate" ? "pipeline" : "filter"}, not just the page
            shown.
          </DialogDescription>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nestedId}>Nested fields</Label>
            <Select
              value={nestedMode}
              onValueChange={(value) => setNestedMode(value as ExportNestedMode)}
              disabled={running}
            >
              <SelectTrigger id={nestedId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {nestedOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {mode === "find" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={capId}
                checked={capToLimit}
                onCheckedChange={(checked) => setCapToLimit(checked === true)}
                disabled={running}
              />
              <Label htmlFor={capId} className="font-normal">
                Cap to current limit (<span className="tabular-nums">{limit}</span>)
              </Label>
            </div>
          )}

          {running && (
            <p role="status" className="text-sm text-fg-2 tabular-nums">
              Exporting… {rowsWritten.toLocaleString()} rows written
            </p>
          )}
          {summary && (
            <p role="status" className="text-sm text-ok tabular-nums">
              Done - {summary.rowsWritten.toLocaleString()} rows, {summary.columns.length} columns
            </p>
          )}
          {error && <p className="text-sm break-words text-danger">{error}</p>}
        </DialogBody>
        <DialogFooter className="justify-end">
          {running ? (
            <Button onClick={() => cancel()}>Cancel</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
              <Button variant="primary" onClick={handleExport}>
                <Download />
                {summary ? "Export again" : "Export"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
