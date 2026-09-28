/**
 * Reading an agent's answer: prose, and the fenced blocks it proposes. The
 * system prompt asks for ```filter <collection>, ```pipeline <collection>
 * and ```js; anything else fenced is shown as plain code.
 */

export type ProposalKind = "filter" | "pipeline" | "script";

export interface Proposal {
  kind: ProposalKind;
  /** The collection named after the language, if any. */
  collection: string | null;
  code: string;
}

export type AnswerBlock =
  | { kind: "prose"; text: string }
  | { kind: "proposal"; proposal: Proposal }
  | { kind: "code"; lang: string; code: string; open: boolean };

const KINDS: Record<string, ProposalKind> = {
  filter: "filter",
  pipeline: "pipeline",
  js: "script",
  javascript: "script",
  mongo: "script",
  mongosh: "script",
};

/**
 * Splits `text` into prose and fenced blocks. A fence still open (the answer
 * is streaming) comes back as plain code, so no card acts on half a query.
 */
export function parseAnswer(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  const lines = text.split("\n");
  let prose: string[] = [];
  let fence: { lang: string; info: string; body: string[] } | null = null;

  const flushProse = () => {
    const joined = prose.join("\n").trim();
    if (joined) blocks.push({ kind: "prose", text: joined });
    prose = [];
  };

  for (const line of lines) {
    const marker = /^\s*```\s*([\w-]*)\s*(.*)$/.exec(line);
    if (fence) {
      if (marker && !marker[1] && !marker[2]) {
        blocks.push(closeFence(fence.lang, fence.info, fence.body.join("\n")));
        fence = null;
      } else fence.body.push(line);
    } else if (marker) {
      flushProse();
      fence = { lang: marker[1].toLowerCase(), info: marker[2].trim(), body: [] };
    } else prose.push(line);
  }
  flushProse();
  if (fence) blocks.push({ kind: "code", lang: fence.lang, code: fence.body.join("\n"), open: true });
  return blocks;
}

function closeFence(lang: string, info: string, code: string): AnswerBlock {
  const kind = KINDS[lang];
  if (!kind) return { kind: "code", lang, code, open: false };
  const collection = kind === "script" ? null : /^[\w.$-]+$/.test(info) ? info : null;
  return { kind: "proposal", proposal: { kind, collection, code: code.trim() } };
}

/** The first proposal of a kind in an answer, for the inline asks. */
export function firstProposal(text: string, kind: ProposalKind): Proposal | null {
  for (const block of parseAnswer(text)) {
    if (block.kind === "proposal" && block.proposal.kind === kind) return block.proposal;
  }
  return null;
}

const WRITE_METHODS = [
  "insertOne",
  "insertMany",
  "updateOne",
  "updateMany",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "bulkWrite",
  "findOneAndUpdate",
  "findOneAndReplace",
  "findOneAndDelete",
  "createIndex",
  "dropIndex",
  "drop",
];

export interface ScriptWrite {
  /** The collection written to, when the script names it plainly. */
  collection: string | null;
  method: string;
}

/**
 * The writes a console script makes, found by name: `db.collection("x")`
 * called directly or through a variable bound to it, and aggregations
 * ending in $out or $merge. A heuristic for the warning on the card - the
 * script itself only runs when the user presses Run.
 */
export function scriptWrites(code: string): ScriptWrite[] {
  const bindings = new Map<string, string>();
  const bind = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*db\s*\.\s*(?:collection|getCollection)\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  for (const m of code.matchAll(bind)) bindings.set(m[1], m[2]);

  const writes: ScriptWrite[] = [];
  const call = new RegExp(
    String.raw`(?:db\s*\.\s*(?:collection|getCollection)\(\s*["'\x60]([^"'\x60]+)["'\x60]\s*\)|\b([A-Za-z_$][\w$]*))\s*\.\s*(${WRITE_METHODS.join("|")})\s*\(`,
    "g",
  );
  for (const m of code.matchAll(call)) {
    const collection = m[1] ?? (m[2] ? bindings.get(m[2]) ?? null : null);
    if (m[2] && !m[1] && !bindings.has(m[2]) && m[2] !== "db") continue;
    writes.push({ collection, method: m[3] });
  }
  if (/["']?\$(out|merge)["']?\s*:/.test(code)) writes.push({ collection: null, method: "$out/$merge" });
  return writes;
}

/** Whether a pipeline's text writes, which rules out a dry run. */
export function pipelineWrites(code: string): boolean {
  return /["']?\$(out|merge)["']?\s*:/.test(code);
}
