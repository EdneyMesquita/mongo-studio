import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useSessionsStore } from "../../store/sessionsStore";
import type { CollectionTab } from "../../store/sessionsStore";

/**
 * Previous / next page of a find: moves the tab's skip by its limit and runs
 * the query again. Aggregations and unlimited finds have no pages.
 */
export function ResultsPager({ tab, total }: { tab: CollectionTab; total: number | null }) {
  const session = useConnectionsStore((s) => s.sessions[tab.connection.id]);
  const updateTab = useSessionsStore((s) => s.updateTab);
  const runQuery = useSessionsStore((s) => s.runQuery);

  const { skip, limit, results, loading } = tab;
  const paged = tab.resultsMode === "find" && limit > 0 && session !== undefined;
  const returned = results?.documents.length ?? 0;
  const hasNext =
    returned >= limit && (total === null || skip + returned < total);

  function goTo(nextSkip: number) {
    if (!session) return;
    updateTab(tab.id, { skip: nextSkip });
    runQuery(session.sessionId, tab.id);
  }

  const buttonClass = "rounded-sm disabled:opacity-35";
  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        className={buttonClass}
        aria-label="Previous page"
        title="Previous page"
        disabled={!paged || loading || skip === 0}
        onClick={() => goTo(Math.max(0, skip - limit))}
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className={buttonClass}
        aria-label="Next page"
        title="Next page"
        disabled={!paged || loading || !hasNext}
        onClick={() => goTo(skip + limit)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
