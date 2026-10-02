import { useId, useState } from "react";
import { Download } from "lucide-react";
import { useConnectionsStore } from "../../store/connectionsStore";
import type { CollectionTab } from "../../store/sessionsStore";
import { useExportStore } from "../../store/exportStore";
import type { ExportSource } from "../../store/exportStore";
import type { ExportFormat, ExportNestedMode } from "../../types/export";
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
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportQueryOf } from "./exportQuery";

/** What to export: a collection tab's whole query, or a console result. */
export type ExportTarget =
  | { kind: "tab"; tab: CollectionTab }
  | {
      kind: "result";
      value: unknown;
      /** Where it came from, shown under the title, e.g. "shop console". */
      label: string;
      /** File name suggested in the save dialog, without extension. */
      baseName: string;
    };

interface ExportDialogProps {
  target: ExportTarget;
  onClose: () => void;
}

const formatOptions: { value: ExportFormat; label: string }[] = [
  { value: "csv", label: "CSV" },
  { value: "json", label: "JSON" },
];

const nestedOptions: { id: ExportNestedMode; label: string }[] = [
  { id: "flatten", label: "Flatten into columns (address.city, items.0.sku)" },
  { id: "stringify", label: "Keep as JSON text in one column" },
];

function itemsOf(value: unknown): string {
  if (!Array.isArray(value)) return "a single value";
  return `${value.length.toLocaleString("en")} ${value.length === 1 ? "item" : "items"}`;
}

/**
 * Exports to CSV or JSON: a collection tab's whole query (streamed from the
 * server, not just the page shown) or a console result already in hand.
 */
export function ExportDialog({ target, onClose }: ExportDialogProps) {
  const tab = target.kind === "tab" ? target.tab : null;
  const session = useConnectionsStore((st) => (tab ? st.sessions[tab.connection.id] : undefined));
  const { running, rowsWritten, summary, error, start, cancel, reset } = useExportStore();
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [nestedMode, setNestedMode] = useState<ExportNestedMode>("flatten");
  const [capToLimit, setCapToLimit] = useState(false);
  const nestedId = useId();
  const capId = useId();

  if (tab && !session) return null;

  async function handleExport() {
    let source: ExportSource;
    let baseName: string;
    if (target.kind === "tab") {
      const { tab: t } = target;
      try {
        source = {
          kind: "query",
          sessionId: session!.sessionId,
          database: t.database,
          collection: t.collection,
          query: exportQueryOf(t, capToLimit),
        };
      } catch (e) {
        useExportStore.setState({ error: String(e) });
        return;
      }
      baseName = t.collection;
    } else {
      source = { kind: "value", value: target.value };
      baseName = target.baseName;
    }
    await start(source, { format, nestedMode }, baseName);
  }

  function handleClose() {
    reset();
    onClose();
  }

  const subtitle = tab ? `${tab.database}.${tab.collection}` : target.kind === "result" ? target.label : "";
  const unit = (n: number) =>
    format === "csv" ? (n === 1 ? "row" : "rows") : n === 1 ? "document" : "documents";

  return (
    // A running export only stops through Cancel; the dialog stays up until then.
    <Dialog open onOpenChange={(open) => !open && !running && handleClose()}>
      <DialogContent className="max-w-md" showCloseButton={!running}>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <span className="truncate font-data text-fg-3">{subtitle}</span>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <DialogDescription>
            {tab
              ? `Exports the current ${tab.mode === "aggregate" ? "pipeline" : "filter"}, not just the page shown.`
              : `Exports the console's result: ${itemsOf(target.kind === "result" ? target.value : null)}.`}
          </DialogDescription>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg">Format</span>
            <SegmentedControl
              aria-label="Format"
              value={format}
              onChange={setFormat}
              options={formatOptions}
              className="self-start"
            />
          </div>
          {format === "csv" && (
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
          )}
          {tab?.mode === "find" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={capId}
                checked={capToLimit}
                onCheckedChange={(checked) => setCapToLimit(checked === true)}
                disabled={running}
              />
              <Label htmlFor={capId} className="font-normal">
                <span>
                  Cap to current limit (<span className="tabular-nums">{tab.limit}</span>)
                </span>
              </Label>
            </div>
          )}

          {running && (
            <p role="status" className="text-sm text-fg-2 tabular-nums">
              Exporting… {rowsWritten.toLocaleString()} {unit(rowsWritten)} written
            </p>
          )}
          {summary && (
            <p role="status" className="text-sm text-ok tabular-nums">
              Done - {summary.rowsWritten.toLocaleString()} {unit(summary.rowsWritten)}
              {summary.columns.length > 0 && `, ${summary.columns.length} columns`}
            </p>
          )}
          {error && <p className="text-sm break-words text-danger">{error}</p>}
        </DialogBody>
        <DialogFooter className="justify-end">
          {running ? (
            <Button onClick={() => cancel()} disabled={target.kind === "result"}>
              Cancel
            </Button>
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
