import { useEffect, useMemo, useState } from "react";
import { Bot, Eye, Link2, Loader2, Save, Sparkles, Trash2, ArrowLeftRight, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { api } from "../../lib/tauri";
import { confirm } from "../../store/confirmStore";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useConsoleStore } from "../../store/consoleStore";
import { isUnsaved, useRelationsStore } from "../../store/relationsStore";
import { useSessionsStore, type RelationTab, type TabConnection } from "../../store/sessionsStore";
import { useSettingsStore } from "../../store/settingsStore";
import type { Relation, RelationCheckLine, RelationCheckReport, RelationCondition, RelationSuggestion } from "../../types/relations";
import { fieldRows, guessBridge } from "./fieldRows";
import { RelationCanvas, Stepper, type CanvasSide } from "./RelationCanvas";
import { RelationPreview, type PreviewFilter } from "./RelationPreview";
import { RelationSettings, type SectionId } from "./RelationSettings";
import { runnable, useRelationData } from "./useRelationData";
import { createIndexScript } from "./createIndexScript";
import { isPattern } from "../../lib/relations";

const errorText = (e: unknown) => String(e).replace(/^Error: /, "");
const same = (a: Relation, b: Relation) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A relation's editor tab: a sample From document on the left, the To
 * document it finds on the right, a wire per linked field pair, suggested
 * links under them, and what it finds for every sample document below.
 * Connections, tenant, rules, names and the check sit in a side panel.
 * Edits stay in a working copy until Save.
 */
export function RelationEditor({ tab }: { tab: RelationTab; active: boolean }) {
  const saved = useRelationsStore((s) => s.relations.find((r) => r.id === tab.relationId) ?? null);
  const working = useRelationsStore((s) => s.working[tab.relationId] ?? null);
  const relation = working ?? saved;
  if (!relation) {
    return (
      <div className="grid h-full place-content-center gap-2 bg-editor text-center text-fg-2">
        <p className="m-0">This relation no longer exists.</p>
        <Button className="justify-self-center" onClick={() => useSessionsStore.getState().closeTab(tab.id)}>
          Close tab
        </Button>
      </div>
    );
  }
  return <Editor tab={tab} relation={relation} saved={saved} />;
}

function Editor({ tab, relation, saved }: { tab: RelationTab; relation: Relation; saved: Relation | null }) {
  const unsaved = isUnsaved(relation.id);
  const dirty = unsaved || !saved || !same(relation, saved);
  const profiles = useConnectionsStore((s) => s.profiles);
  const sessions = useConnectionsStore((s) => s.sessions);
  const connecting = useConnectionsStore((s) => s.connecting);

  const [sample, setSample] = useState(0);
  const [found, setFound] = useState(0);
  const [ruleIndex, setRuleIndex] = useState(0);
  const [pending, setPending] = useState<string | null>(() => useRelationsStore.getState().startField[relation.id] ?? null);
  const [open, setOpen] = useState<Set<SectionId>>(
    () => new Set<SectionId>(unsaved ? ["conn"] : relation.draft ? ["check"] : []),
  );
  const [filter, setFilter] = useState<PreviewFilter>("all");
  const sampleOverride = useRelationsStore((s) => s.samples[relation.id] ?? null);
  const setSampleOverride = (collection: string) => useRelationsStore.getState().setSample(relation.id, collection);
  const [expanded, setExpanded] = useState({ left: new Set<string>(), right: new Set<string>() });
  const [saving, setSaving] = useState(false);

  const edit = (next: Relation) => {
    const store = useRelationsStore.getState();
    if (saved && !isUnsaved(next.id) && same(next, saved)) store.dropWorking(next.id);
    else store.setWorking(next);
  };

  const data = useRelationData(tab, relation, sampleOverride);
  const rule = relation.rules[Math.min(ruleIndex, relation.rules.length - 1)] ?? [];
  const sampleIdx = Math.min(sample, Math.max(0, data.sampleDocs.length - 1));
  const sampleDoc = data.sampleDocs[sampleIdx];
  const result = data.preview?.results[sampleIdx];
  const foundDocs = result?.docs ?? [];
  const foundIdx = Math.min(found, Math.max(0, foundDocs.length - 1));
  const toDoc = foundDocs[foundIdx] ?? data.toSample;

  const leftRows = useMemo(() => fieldRows(sampleDoc, rule.map((c) => c.from), expanded.left), [sampleDoc, rule, expanded.left]);
  const rightRows = useMemo(
    () => fieldRows(toDoc, [...rule.map((c) => c.to), ...relation.scope.map((s) => s.to)], expanded.right),
    [toDoc, rule, relation.scope, expanded.right],
  );

  // suggestions, once per pair of collections, while the rule has no links
  const [suggestions, setSuggestions] = useState<{ key: string; list: RelationSuggestion[]; state: "loading" | "ready" | "error" } | null>(null);
  const suggestKey = `${data.sourceSessionId}|${relation.from.db}|${data.sampleCollection}|${data.targetSessionId}|${relation.to.db}|${data.targetCollection}`;
  const canSuggest = Boolean(data.sourceSessionId && data.targetSessionId && data.sampleCollection && relation.to.db && data.targetCollection);
  const suggest = () => {
    if (!canSuggest) return;
    setSuggestions({ key: suggestKey, list: [], state: "loading" });
    api
      .relationSuggestLinks({
        fromSessionId: data.sourceSessionId!,
        from: { database: relation.from.db, collection: data.sampleCollection! },
        toSessionId: data.targetSessionId!,
        to: { database: relation.to.db, collection: data.targetCollection! },
      })
      .then((list) => setSuggestions((s) => (s?.key === suggestKey ? { key: suggestKey, list, state: "ready" } : s)))
      .catch(() => setSuggestions((s) => (s?.key === suggestKey ? { key: suggestKey, list: [], state: "error" } : s)));
  };
  const noLinks = relation.rules.every((r) => r.length === 0);
  useEffect(() => {
    if (noLinks && canSuggest && suggestions?.key !== suggestKey) suggest();
  }, [suggestKey, canSuggest, noLinks]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownSuggestions =
    suggestions?.key === suggestKey ? suggestions.list.filter((s) => !rule.some((c) => c.from === s.from && c.to === s.to)) : [];

  // the check
  const [check, setCheck] = useState<{ state: "idle" | "loading" | "ready" | "error"; report: RelationCheckReport | null; error: string | null }>({
    state: "idle",
    report: null,
    error: null,
  });
  const canCheck = runnable(relation) && Boolean(data.sourceSessionId && data.targetSessionId);
  const runCheck = () => {
    if (!data.sourceSessionId || !data.targetSessionId) return;
    setCheck((c) => ({ ...c, state: "loading", error: null }));
    api
      .relationCheck({ relation, fromConnectionId: tab.connection.id, fromSessionId: data.sourceSessionId, toSessionId: data.targetSessionId })
      .then((report) => setCheck({ state: "ready", report, error: null }))
      .catch((e) => setCheck({ state: "error", report: null, error: errorText(e) }));
  };

  const setRule = (next: RelationCondition[]) => {
    const rules = relation.rules.length ? [...relation.rules] : [[]];
    rules[Math.min(ruleIndex, rules.length - 1)] = next;
    edit({ ...relation, rules });
  };
  const link = (from: string, to: string, as?: RelationCondition["as"]) => {
    if (rule.some((c) => c.from === from && c.to === to)) return;
    const leftValue = leftRows.find((r) => r.path === from)?.value;
    const rightValue = rightRows.find((r) => r.path === to)?.value;
    setRule([...rule, { from, op: "eq", to, as: as ?? guessBridge(leftValue, rightValue) }]);
  };

  const connectionOf = (id: string | null | undefined): TabConnection | null => {
    const p = profiles.find((x) => x.id === id);
    return p ? { id: p.id, name: p.name, summary: p.summary } : null;
  };
  const target = connectionOf(data.targetConnectionId);

  const createIndex = (line: RelationCheckLine) => {
    if (!line.index) return;
    const conn = line.index.database === relation.to.db && target ? target : tab.connection;
    const id = useSessionsStore.getState().openConsole(conn, line.index.database, isPattern(line.index.collection) ? null : line.index.collection);
    const script = createIndexScript(relation.name, line.index);
    useSettingsStore.getState().setTabEngine(id, "mongosh"); // the built-in engine can't create indexes
    useConsoleStore.getState().setScript(id, script);
  };

  const save = async () => {
    if (!runnable(relation) || !relation.from.db || !relation.from.coll) {
      toast.error("Not ready to save", { description: "Pick both collections and link at least one pair of fields." });
      return;
    }
    setSaving(true);
    try {
      const name = relation.name.trim() || relation.fromName || `${relation.from.coll} → ${relation.to.coll}`;
      const stored = await useRelationsStore.getState().save({ ...relation, id: unsaved ? "" : relation.id, name, draft: null });
      const store = useRelationsStore.getState();
      store.dropWorking(relation.id);
      if (unsaved) {
        // the saved relation keeps sampling the same tenant
        if (data.sampleCollection) store.setSample(stored.id, data.sampleCollection);
        const sessionsStore = useSessionsStore.getState();
        sessionsStore.openRelation(stored.id, tab.connection, tab.database);
        sessionsStore.closeTab(tab.id);
      }
      toast.success(relation.draft ? "Relation saved from the draft" : "Relation saved", {
        description: "Shows in each document's Related section and as Related columns.",
      });
    } catch (e) {
      toast.error("Couldn't save the relation", { description: errorText(e) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (unsaved) {
      useRelationsStore.getState().dropWorking(relation.id);
      useSessionsStore.getState().closeTab(tab.id);
      return;
    }
    const draft = Boolean(saved?.draft);
    const ok = draft
      ? true
      : await confirm({
          title: `Delete "${relation.name}"?`,
          message: "Related sections and columns that use it stop showing. Nothing in the databases changes.",
          confirmLabel: "Delete",
          danger: true,
        });
    if (!ok) return;
    try {
      await useRelationsStore.getState().remove(relation.id);
      useRelationsStore.getState().dropWorking(relation.id);
      useSessionsStore.getState().closeTab(tab.id);
      if (draft) toast(`Draft discarded`, { description: `Proposed by ${saved?.draft?.by}.` });
    } catch (e) {
      toast.error("Couldn't delete the relation", { description: errorText(e) });
    }
  };

  const sourceLive = Boolean(data.sourceSessionId);
  const fromConnectionText =
    relation.from.conn === "any" ? (
      <>
        {tab.connection.name} · any connection with <b>{relation.from.db || "…"}</b>
      </>
    ) : (
      tab.connection.name
    );

  const left: CanvasSide = {
    rows: leftRows,
    doc: sampleDoc,
    connection: tab.connection,
    connectionText: fromConnectionText,
    db: relation.from.db,
    coll: relation.from.coll,
    status: (
      <>
        <Eye className="size-3 shrink-0" />
        {isPattern(relation.from.coll) ? (
          <SamplePicker
            value={data.sampleCollection}
            matching={data.matching}
            onPick={(c) => {
              setSampleOverride(c);
              setSample(0);
              setFound(0);
            }}
          />
        ) : (
          <span className="truncate font-data">{data.sampleCollection ?? ""}</span>
        )}
        <span className="flex-1" />
        {data.sampleDocs.length > 0 && (
          <Stepper
            index={sampleIdx}
            count={data.sampleDocs.length}
            label="sample"
            onStep={(d) => {
              setSample(sampleIdx + d);
              setFound(0);
            }}
          />
        )}
      </>
    ),
    empty: !sourceLive ? (
      <Placeholder>
        {connecting[tab.connection.id] ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Connecting to {tab.connection.name}…
          </>
        ) : (
          <>
            {tab.connection.name} isn't connected.
            <Button size="sm" onClick={() => void useConnectionsStore.getState().connect(tab.connection.id)}>
              Connect
            </Button>
          </>
        )}
      </Placeholder>
    ) : !relation.from.db || !relation.from.coll ? (
      <Placeholder>Pick the From database and collection under Connections.</Placeholder>
    ) : data.sampleState === "loading" ? (
      <Placeholder>
        <Loader2 className="size-3.5 animate-spin" /> Reading a sample…
      </Placeholder>
    ) : data.sampleError ? (
      <Placeholder tone="danger">{data.sampleError}</Placeholder>
    ) : !data.sampleCollection ? (
      <Placeholder>No collection on {tab.connection.name} matches {relation.from.coll}.</Placeholder>
    ) : data.sampleDocs.length === 0 ? (
      <Placeholder>{data.sampleCollection} has no documents to sample.</Placeholder>
    ) : undefined,
  };

  const targetLive = Boolean(data.targetSessionId);
  const right: CanvasSide = {
    rows: rightRows,
    doc: toDoc,
    connection: target,
    connectionText:
      relation.to.conn === "cluster" ? (
        <>
          Same cluster · <b>{target?.name ?? (data.targetConnectionId === undefined ? "…" : "none found")}</b>
        </>
      ) : (
        (target?.name ?? "")
      ),
    db: relation.to.db,
    coll: relation.to.coll,
    status: !targetLive || !relation.to.db || !relation.to.coll ? (
      <span />
    ) : !runnable(relation) ? (
      <span>a document of {data.targetCollection ?? "the collection"}</span>
    ) : result ? (
      <>
        {result.count > 0 ? (
          <b className="font-semibold text-ok">{result.count} found</b>
        ) : (
          <b className="font-semibold text-warn">none found</b>
        )}
        <span>for this sample</span>
        <span className="flex-1" />
        {foundDocs.length > 1 && <Stepper index={foundIdx} count={foundDocs.length} label="found document" onStep={(d) => setFound(foundIdx + d)} />}
      </>
    ) : (
      <span>{data.previewState === "loading" ? "matching…" : ""}</span>
    ),
    empty:
      !relation.to.db || !relation.to.coll ? (
        <Placeholder>Pick the To database and collection under Connections.</Placeholder>
      ) : data.targetConnectionId === null ? (
        <Placeholder>No connection pairs with {tab.connection.name} for {relation.to.db}. Pick one under Connections.</Placeholder>
      ) : target && !sessions[target.id] ? (
        <Placeholder>
          {connecting[target.id] ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Connecting to {target.name}…
            </>
          ) : (
            <>
              {target.name} isn't connected.
              <Button size="sm" onClick={() => void useConnectionsStore.getState().connect(target.id)}>
                Connect
              </Button>
            </>
          )}
        </Placeholder>
      ) : !toDoc ? (
        <Placeholder>{data.targetCollection} has no document to show{data.tenant ? ` for ${data.tenant}` : ""}.</Placeholder>
      ) : undefined,
  };

  const idleText = !sourceLive
    ? "Connect to read a sample."
    : !runnable(relation)
      ? "Link a pair of fields to see what each document finds."
      : !targetLive
        ? "Connect the other side to match."
        : "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-line pl-2.5 pr-2">
        <Link2 className="size-4 shrink-0 text-accent-text" />
        <input
          aria-label="Relation name"
          placeholder="Name this relation"
          value={relation.name}
          onChange={(e) => edit({ ...relation, name: e.target.value })}
          className="w-[220px] rounded-sm border-0 bg-transparent px-1.5 py-[3px] text-[14px] font-semibold text-fg outline-none placeholder:font-normal placeholder:text-fg-3 hover:bg-field hover:shadow-[0_0_0_1px_var(--color-field-line)] focus:bg-field focus:shadow-[0_0_0_1px_var(--color-field-line)]"
        />
        <span className="rounded-sm bg-fg/8 px-1.5 text-xs text-fg-2">
          {relation.to.conn === "cluster" ? "per cluster" : relation.to.conn === "same" ? "same connection" : "fixed connection"}
        </span>
        {dirty && !unsaved && <span className="text-xs text-fg-3">edited</span>}
        {relation.rules.length > 1 && (
          <SegmentedControl<string>
            aria-label="Rule"
            size="sm"
            value={String(Math.min(ruleIndex, relation.rules.length - 1))}
            onChange={(v) => setRuleIndex(Number(v))}
            options={relation.rules.map((_, i) => ({ value: String(i), label: `Rule ${i + 1}` }))}
          />
        )}
        <span className="flex-1" />
        {pending && (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-accent/10 px-2.5 py-[3px] text-sm text-accent-text">
            <Link2 className="size-3" />
            Now click a field on the right to link <span className="font-data">{pending}</span>
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => setPending(null)}>
              Cancel
            </button>
          </span>
        )}
        <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => void remove()}>
          {unsaved ? <X className="size-3.5" /> : <Trash2 className="size-3.5" />}
          {unsaved ? "Discard" : saved?.draft ? "Discard draft" : "Delete"}
        </Button>
        <Button variant="primary" disabled={saving || (!dirty && !relation.draft)} onClick={() => void save()}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {relation.draft ? "Save relation" : "Save"}
        </Button>
      </div>

      {saved?.draft && (
        <div className="flex flex-none items-start gap-2.5 border-b border-line bg-[color-mix(in_srgb,var(--color-warn)_8%,var(--color-editor))] py-2.5 pl-4 pr-3.5 text-sm text-fg-2">
          <Bot className="mt-0.5 size-4 shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <b className="font-semibold text-fg">Proposed by {saved.draft.by}</b>{" "}
            <span className="text-fg-3">over MCP{draftTime(saved.draft.at)} · a draft: nothing uses it until you save it</span>
            {saved.draft.why && <p className="m-0 mt-[3px] max-w-[110ch] leading-normal">{saved.draft.why}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={() => void remove()}>
            Discard
          </Button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 min-w-0 flex-col overflow-auto">
          <RelationCanvas
            relation={relation}
            rule={rule}
            left={left}
            right={right}
            pending={pending}
            tenant={data.tenant}
            expanded={expanded}
            onToggleExpand={(side, path) =>
              setExpanded((e) => {
                const next = new Set(e[side]);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return { ...e, [side]: next };
              })
            }
            onPickLeft={(path) => setPending((p) => (p === path ? null : path))}
            onPickRight={(path) => {
              if (!pending) return;
              link(pending, path);
              setPending(null);
            }}
            onChange={(from, to) => setRule(to ? rule.map((c) => (c === from ? to : c)) : rule.filter((c) => c !== from))}
          />

          {(shownSuggestions.length > 0 || suggestions?.state === "loading" || (canSuggest && !noLinks)) && (
            <div className="mx-5 mb-2.5 mt-1 flex flex-none flex-wrap items-center gap-2 rounded-md border border-dashed border-line px-2.5 py-2 text-sm">
              <Sparkles className="size-3.5 text-accent-text" />
              <span className="text-fg-3">Suggested</span>
              {suggestions?.state === "loading" && (
                <span className="inline-flex items-center gap-1.5 text-fg-3">
                  <Loader2 className="size-3.5 animate-spin" /> Comparing samples…
                </span>
              )}
              {shownSuggestions.map((s) => (
                <span key={`${s.from}|${s.to}`} className="inline-flex items-center gap-1.5 rounded-md bg-fg/5 py-0.5 pl-2 pr-1">
                  <span className="font-data text-[11.5px] text-fg">{s.from}</span>
                  <ArrowLeftRight className="size-3 text-fg-3" />
                  <span className="font-data text-[11.5px] text-fg">{s.to}</span>
                  <span className="text-fg-3">
                    {s.op === "prefix" ? "starts with · " : ""}
                    {s.matched} of {s.sampled} sampled values match
                  </span>
                  <Button size="sm" onClick={() => link(s.from, s.to, s.as)}>
                    Link
                  </Button>
                </span>
              ))}
              {suggestions?.state === "ready" && shownSuggestions.length === 0 && <span className="text-fg-3">nothing more found in the samples</span>}
              {suggestions?.state === "error" && <span className="text-fg-3">couldn't compare the samples</span>}
              {suggestions?.state !== "loading" && suggestions?.key !== suggestKey && (
                <Button variant="ghost" size="sm" onClick={suggest}>
                  Suggest links
                </Button>
              )}
            </div>
          )}

          <RelationPreview
            docs={data.sampleDocs}
            output={data.preview}
            state={data.previewState}
            error={data.previewError}
            idleText={idleText}
            keyField={rule[0]?.from ?? null}
            selected={sampleIdx}
            onSelect={(i) => {
              setSample(i);
              setFound(0);
            }}
            filter={filter}
            onFilter={setFilter}
          />
        </div>

        <RelationSettings
          relation={relation}
          onChange={edit}
          ruleIndex={Math.min(ruleIndex, relation.rules.length - 1)}
          onRule={setRuleIndex}
          open={open}
          onToggle={(id) =>
            setOpen((o) => {
              const next = new Set(o);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          sampleDoc={sampleDoc}
          sampleConnection={tab.connection}
          sampleCollection={data.sampleCollection}
          candidates={data.candidates}
          tenant={data.tenant}
          targetConnectionId={data.targetConnectionId}
          check={check}
          canCheck={canCheck}
          onCheck={runCheck}
          onCreateIndex={createIndex}
        />
      </div>
    </div>
  );
}

/** The sampled collection of a pattern: search the tenants to pick another, among every match. */
function SamplePicker({ value, matching, onPick }: { value: string | null; matching: string[]; onPick: (collection: string) => void }) {
  return (
    <Combobox
      aria-label="Sample collection"
      variant="inline"
      mono
      value={value ?? ""}
      options={matching.map((c) => ({ value: c }))}
      searchPlaceholder={`Search ${matching.length.toLocaleString("en")} tenants…`}
      title={`The collection sampled: one of ${matching.length.toLocaleString("en")} matching the pattern`}
      onChange={onPick}
      className="max-w-[60%]"
    />
  );
}

function draftTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at ? ` at ${at}` : "";
  return ` at ${d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`;
}

function Placeholder({ children, tone }: { children: React.ReactNode; tone?: "danger" }) {
  return (
    <div className={cn("flex min-h-[90px] flex-wrap items-center justify-center gap-2 px-4 py-6 text-center text-sm text-fg-3", tone === "danger" && "text-danger")}>
      {children}
    </div>
  );
}

