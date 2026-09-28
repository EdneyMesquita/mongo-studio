import { Braces, ListTree, Table } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { SegmentOption } from "@/components/ui/segmented-control";
import { useUiStore } from "../../store/uiStore";
import type { ResultView } from "../../store/uiStore";

const OPTIONS: SegmentOption<ResultView>[] = [
  { value: "grid", label: "Grid", title: "Grid", icon: <Table /> },
  { value: "tree", label: "Tree", title: "Tree", icon: <ListTree /> },
  { value: "json", label: "JSON", title: "JSON", icon: <Braces /> },
];

/** Switches every result pane at once - Browse and the console share it. */
export function ResultViewToggle() {
  const resultView = useUiStore((s) => s.resultView);
  const setResultView = useUiStore((s) => s.setResultView);
  return (
    <SegmentedControl
      aria-label="Result view"
      iconOnly
      value={resultView}
      onChange={setResultView}
      options={OPTIONS}
    />
  );
}
