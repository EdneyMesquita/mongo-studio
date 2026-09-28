import { CollectionTabView } from "../collection/CollectionTabView";
import { ScriptConsole } from "../console/ScriptConsole";
import { CollectionTabs } from "../tabs/CollectionTabs";
import { selectActiveTab, useSessionsStore } from "../../store/sessionsStore";
import { ShortcutWatermark } from "./ShortcutWatermark";
import { WelcomeScreen } from "./WelcomeScreen";
import { useConnectedCount } from "./useActiveConnection";

/** The editor: the tab strip and the active tab, or an empty state. */
export function EditorArea() {
  const connected = useConnectedCount();
  const tabs = useSessionsStore((s) => s.tabs);
  const activeTab = useSessionsStore(selectActiveTab);

  if (connected === 0 && !activeTab) return <WelcomeScreen />;

  return (
    <>
      {connected > 0 && <CollectionTabs />}
      <div className="relative min-h-0 flex-1">
        {/* Every collection tab stays mounted and only the active one shows,
            so switching back keeps its scroll position and expanded nodes. */}
        {tabs.map(
          (tab) =>
            tab.kind === "collection" && (
              <div
                key={tab.id}
                className={`absolute inset-0 ${tab.id === activeTab?.id ? "" : "invisible"}`}
              >
                <CollectionTabView tab={tab} active={tab.id === activeTab?.id} />
              </div>
            ),
        )}
        {/* A console tab is only a console. */}
        {activeTab?.kind === "console" && (
          <div className="absolute inset-0">
            <ScriptConsole tab={activeTab} />
          </div>
        )}
        {!activeTab && <ShortcutWatermark />}
      </div>
    </>
  );
}
