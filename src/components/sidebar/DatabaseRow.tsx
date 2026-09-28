import { Layers } from "lucide-react";
import { databaseKey, selectActiveTab, useSessionsStore } from "../../store/sessionsStore";
import type { TabConnection } from "../../store/sessionsStore";
import type { CollectionInfo, DatabaseInfo } from "../../types/connection";
import { RowContextMenu } from "@/components/common/ActionMenu";
import { CollectionRow } from "./CollectionRow";
import { TreeNote } from "./TreeNote";
import { TreeRow } from "./TreeRow";
import { databaseMenuEntries } from "./treeMenus";

interface DatabaseRowProps {
  db: DatabaseInfo;
  sessionId: string;
  connection: TabConnection;
  depth: number;
  /** The sidebar search, lowercased. */
  query: string;
  /** This database's collections matching the search, when some do; it opens to show them. */
  matches: CollectionInfo[] | null;
}

export function DatabaseRow({ db, sessionId, connection, depth, query, matches }: DatabaseRowProps) {
  const tree = useSessionsStore((s) => s.databaseTree[databaseKey(connection.id, db.name)]);
  // Strings, not the tab object, so typing in a query doesn't re-render the tree.
  const activeConnectionId = useSessionsStore(
    (s) => selectActiveTab(s)?.connection.id ?? null,
  );
  const activeDatabase = useSessionsStore((s) => selectActiveTab(s)?.database ?? null);
  // a console tab's collection is only where it started, not what it shows
  const activeTabCollection = useSessionsStore((s) => {
    const tab = selectActiveTab(s);
    return tab?.kind === "collection" ? tab.collection : null;
  });
  const toggleDatabase = useSessionsStore((s) => s.toggleDatabase);
  const openCollection = useSessionsStore((s) => s.openCollection);
  const openConsole = useSessionsStore((s) => s.openConsole);

  const isOpen = (tree?.expanded ?? false) || matches !== null;
  const collections = tree?.collections ?? [];
  const collectionsLoading = tree?.loading ?? false;
  const collectionsError = tree?.error ?? null;
  // Collapsing is only visual, so surface the active tab's collection on the
  // database row itself - otherwise it disappears from the sidebar.
  const activeCollection =
    activeConnectionId === connection.id && activeDatabase === db.name
      ? activeTabCollection
      : null;
  const showsActiveInline = !isOpen && activeCollection !== null;

  return (
    <>
      <RowContextMenu
        entries={() =>
          databaseMenuEntries({
            database: db.name,
            connectionName: connection.name,
            onOpenConsole: () => openConsole(connection, db.name, null),
          })
        }
      >
        <TreeRow
          depth={depth}
          expanded={isOpen}
          selected={showsActiveInline}
          icon={<Layers className="size-3.5 shrink-0 text-fg-2" aria-hidden />}
          label={
            <>
              {db.name}
              {showsActiveInline && <span className="text-fg-2"> · {activeCollection}</span>}
            </>
          }
          onActivate={() => toggleDatabase(connection.id, sessionId, db.name)}
        />
      </RowContextMenu>
      {isOpen && (
        <div role="group">
          {collectionsError ? (
            <TreeNote depth={depth + 1} tone="danger">
              {collectionsError}
            </TreeNote>
          ) : collectionsLoading ? (
            <TreeNote depth={depth + 1}>Loading…</TreeNote>
          ) : (
            collections.length === 0 && <TreeNote depth={depth + 1}>No collections</TreeNote>
          )}
          {/* A search naming some of them narrows the list to those. */}
          {(matches ?? collections).map((coll) => (
            <CollectionRow
              key={coll.name}
              collection={coll}
              database={db.name}
              depth={depth + 1}
              selected={activeCollection === coll.name}
              query={query}
              onOpen={() => openCollection(sessionId, connection, db.name, coll.name)}
              onOpenConsole={() => openConsole(connection, db.name, coll.name)}
            />
          ))}
        </div>
      )}
    </>
  );
}
