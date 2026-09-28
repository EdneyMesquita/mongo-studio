import { Download, KeyRound, Rows3, SquareTerminal, Zap } from "lucide-react";
import type { MainTab } from "../../store/uiStore";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { SegmentOption } from "@/components/ui/segmented-control";

const views: SegmentOption<MainTab>[] = [
  { value: "browse", label: "Documents", icon: <Rows3 /> },
  { value: "indexes", label: "Indexes", icon: <KeyRound /> },
  { value: "console", label: "Console", icon: <SquareTerminal /> },
];

interface CollectionToolbarProps {
  view: MainTab;
  onViewChange: (view: MainTab) => void;
  onExplain: () => void;
  onExport: () => void;
}

/** The 36px bar under a collection tab: the view switch, then query tools. */
export function CollectionToolbar({ view, onViewChange, onExplain, onExport }: CollectionToolbarProps) {
  return (
    <div className="flex h-9 flex-none items-center gap-2 border-b border-line pr-2 pl-2.5">
      <SegmentedControl aria-label="View" value={view} onChange={onViewChange} options={views} />
      <span className="flex-1" />
      {view === "browse" && (
        <>
          <Button variant="ghost" onClick={onExplain} aria-label="Explain">
            <Zap />
            <span className="max-sm:hidden">Explain</span>
          </Button>
          <Button variant="ghost" onClick={onExport} aria-label="Export">
            <Download />
            <span className="max-sm:hidden">Export</span>
          </Button>
        </>
      )}
    </div>
  );
}
