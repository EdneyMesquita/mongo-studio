import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { CollectionTab } from "../../store/sessionsStore";
import { DEFAULT_INSPECTOR_WIDTH, useUiStore } from "../../store/uiStore";
import { DocumentTable } from "../grid/DocumentTable";
import { usePane } from "../layout/paneContext";
import { DocumentInspector } from "./DocumentInspector";
import { InlineDocument } from "./InlineDocument";
import { InspectorResizer } from "./InspectorResizer";
import { useDocumentSelection } from "./useDocumentSelection";
import { useElementWidth } from "./useElementWidth";
import { useMediaQuery } from "./useMediaQuery";

/** The inspector's default width on narrower windows. */
const NARROW_INSPECTOR_WIDTH = 320;
/** Below this width the grid and the inspector stack: the grid would be too narrow beside it. */
const STACK_BELOW = 780;
/** A pane narrower than this has no room for the inspector even stacked: documents open under their rows. */
const INLINE_BELOW = 600;

interface DocumentGridViewProps {
  tab: CollectionTab;
  documents: unknown[];
}

/**
 * The grid with the selected document in an inspector beside it, or under it
 * on narrow windows. In a narrow pane of a split the inspector goes, and a
 * click opens the whole document under its row instead.
 */
export function DocumentGridView({ tab, documents }: DocumentGridViewProps) {
  const [selected, select] = useDocumentSelection(tab.id, documents);
  const pane = usePane();
  const [expanded, setExpanded] = useState<number | null>(null);
  // A new result closes the open document: its row now holds another one.
  useEffect(() => setExpanded(null), [documents]);
  const storedWidth = useUiStore((s) => s.inspectorWidth);
  const [box, boxWidth] = useElementWidth<HTMLDivElement>();
  const stacked = useMediaQuery("(max-width: 959px)") || (boxWidth > 0 && boxWidth < STACK_BELOW);
  const narrow = useMediaQuery("(max-width: 1179px)");
  // Narrow windows start the inspector smaller; a width the user dragged to stays.
  const width =
    narrow && storedWidth === DEFAULT_INSPECTOR_WIDTH ? NARROW_INSPECTOR_WIDTH : storedWidth;
  const inline = pane.compact || (pane.inPane && boxWidth > 0 && boxWidth < INLINE_BELOW);

  if (inline) {
    return (
      <div ref={box} className="flex min-h-0 flex-1">
        <DocumentTable
          documents={documents}
          selectedIndex={selected}
          onSelect={select}
          expandedIndex={expanded}
          onToggleExpand={(i) => setExpanded((open) => (open === i ? null : i))}
          renderExpanded={(i, viewport) => (
            <InlineDocument
              doc={documents[i]}
              index={i}
              width={viewport}
              collectionName={tab.collection}
              tabId={tab.id}
              onClose={() => setExpanded(null)}
            />
          )}
          aria-label={`Documents in ${tab.database}.${tab.collection}`}
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <div ref={box} className={cn("flex min-h-0 flex-1", stacked && "flex-col")}>
      <DocumentTable
        documents={documents}
        selectedIndex={selected}
        onSelect={select}
        fadeRight={!stacked}
        aria-label={`Documents in ${tab.database}.${tab.collection}`}
        className="flex-1"
      />
      <aside
        className={cn(
          "relative flex shrink-0 flex-col",
          stacked ? "h-[45%] border-t border-line" : "border-l border-line",
        )}
        style={stacked ? undefined : { width }}
      >
        {!stacked && <InspectorResizer width={width} />}
        <DocumentInspector
          doc={selected === null ? undefined : documents[selected]}
          collectionName={tab.collection}
          tabId={tab.id}
        />
      </aside>
    </div>
  );
}
