import { Braces, ListTree, Table } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { SegmentOption } from "@/components/ui/segmented-control";
import { useResultView, useUiStore } from "../../store/uiStore";
import type { ResultView } from "../../store/uiStore";

const OPTIONS: SegmentOption<ResultView>[] = [
  { value: "grid", label: "Grid", title: "Grid", icon: <Table /> },
  { value: "tree", label: "Tree", title: "Tree", icon: <ListTree /> },
  { value: "json", label: "JSON", title: "JSON", icon: <Braces /> },
];

/** Switches one result pane's view; the other panes keep theirs. */
export function ResultViewToggle({ viewKey }: { viewKey: string }) {
  const resultView = useResultView(viewKey);
  const setResultView = useUiStore((s) => s.setResultView);
  return (
    <SegmentedControl
      aria-label="Result view"
      iconOnly
      value={resultView}
      onChange={(view) => setResultView(viewKey, view)}
      options={OPTIONS}
    />
  );
}
