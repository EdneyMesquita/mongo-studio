/**
 * Context-aware completion for MongoDB queries: collection names, field
 * paths and operators. Pure - it reads the text before the cursor and asks
 * `CompletionSource` for names - so it can back any editor.
 */

/** Which editor is asking; each accepts a different shape of text. */
export type CompletionEditor = "filter" | "sort" | "pipeline" | "console";

export type SuggestionKind =
  | "collection"
  | "field"
  | "operator"
  | "stage"
  | "variable";

export interface Suggestion {
  label: string;
  insertText: string;
  kind: SuggestionKind;
  detail: string;
  documentation?: string;
  /** Lower sorts first. */
  sortText: string;
}

export interface CompletionResult {
  items: Suggestion[];
  /** Characters before the cursor the chosen item replaces. */
  replaceLength: number;
}

export interface CompletionSource {
  collections: () => Promise<string[]>;
  fields: (collection: string) => Promise<string[]>;
}

type Op = [name: string, doc: string];

const QUERY_OPERATORS: Op[] = [
  ["$eq", "Matches values equal to a value"],
  ["$ne", "Matches values not equal to a value"],
  ["$gt", "Greater than"],
  ["$gte", "Greater than or equal"],
  ["$lt", "Less than"],
  ["$lte", "Less than or equal"],
  ["$in", "Matches any value in an array"],
  ["$nin", "Matches none of the values in an array"],
  ["$and", "All clauses match"],
  ["$or", "At least one clause matches"],
  ["$nor", "No clause matches"],
  ["$not", "Inverts an operator expression"],
  ["$exists", "Field is present (true) or absent (false)"],
  ["$type", "Field is of a BSON type"],
  ["$regex", "Matches a regular expression"],
  ["$options", "Flags for $regex"],
  ["$expr", "Use aggregation expressions in a query"],
  ["$mod", "Remainder of a division"],
  ["$text", "Text search (needs a text index)"],
  ["$search", "Search string for $text"],
  ["$all", "Array contains all the values"],
  ["$elemMatch", "An array element matches all the conditions"],
  ["$size", "Array has this many elements"],
  ["$jsonSchema", "Validates against a JSON Schema"],
];

const STAGES: Op[] = [
  ["$match", "Filters documents"],
  ["$project", "Reshapes documents: include, exclude or compute fields"],
  ["$addFields", "Adds computed fields"],
  ["$set", "Alias of $addFields"],
  ["$unset", "Removes fields"],
  ["$group", "Groups by a key and accumulates"],
  ["$sort", "Orders documents"],
  ["$limit", "Keeps the first n documents"],
  ["$skip", "Skips the first n documents"],
  ["$unwind", "One document per array element"],
  ["$lookup", "Joins another collection"],
  ["$count", "Counts documents into a field"],
  ["$facet", "Runs several pipelines on the same input"],
  ["$bucket", "Groups into ranges you define"],
  ["$bucketAuto", "Groups into evenly sized ranges"],
  ["$sortByCount", "Groups by a value and counts, sorted"],
  ["$replaceRoot", "Replaces the document with an embedded one"],
  ["$replaceWith", "Alias of $replaceRoot"],
  ["$sample", "Random sample of documents"],
  ["$unionWith", "Appends another collection's documents"],
  ["$graphLookup", "Recursive lookup"],
  ["$setWindowFields", "Window functions over sorted partitions"],
  ["$densify", "Fills gaps in a sequence"],
  ["$fill", "Fills null and missing values"],
  ["$redact", "Restricts content by document fields"],
  ["$geoNear", "Orders by distance from a point"],
  ["$out", "Writes the results to a collection"],
  ["$merge", "Merges the results into a collection"],
];

const EXPRESSIONS: Op[] = [
  ["$sum", "Sum (accumulator or expression)"],
  ["$avg", "Average"],
  ["$min", "Minimum"],
  ["$max", "Maximum"],
  ["$first", "First value in a group"],
  ["$last", "Last value in a group"],
  ["$push", "Array of the values in a group"],
  ["$addToSet", "Array of distinct values in a group"],
  ["$count", "Number of documents in a group"],
  ["$mergeObjects", "Combines documents into one"],
  ["$add", "Adds numbers or a number to a date"],
  ["$subtract", "Subtracts"],
  ["$multiply", "Multiplies"],
  ["$divide", "Divides"],
  ["$abs", "Absolute value"],
  ["$round", "Rounds to a decimal place"],
  ["$floor", "Rounds down"],
  ["$ceil", "Rounds up"],
  ["$concat", "Concatenates strings"],
  ["$toUpper", "Uppercase"],
  ["$toLower", "Lowercase"],
  ["$trim", "Trims whitespace"],
  ["$split", "Splits a string into an array"],
  ["$substrCP", "Substring by code points"],
  ["$strLenCP", "String length in code points"],
  ["$regexMatch", "Whether a string matches a regex"],
  ["$replaceAll", "Replaces every occurrence in a string"],
  ["$cond", "If-then-else"],
  ["$ifNull", "First non-null value"],
  ["$switch", "Evaluates cases in order"],
  ["$filter", "Array elements matching a condition"],
  ["$map", "Applies an expression to each array element"],
  ["$reduce", "Folds an array into a value"],
  ["$arrayElemAt", "Element at an index"],
  ["$slice", "Part of an array"],
  ["$concatArrays", "Concatenates arrays"],
  ["$dateToString", "Formats a date"],
  ["$dateFromString", "Parses a date"],
  ["$dateTrunc", "Truncates a date to a unit"],
  ["$dateAdd", "Adds time to a date"],
  ["$dateDiff", "Difference between two dates"],
  ["$year", "Year of a date"],
  ["$month", "Month of a date"],
  ["$dayOfMonth", "Day of the month"],
  ["$hour", "Hour of a date"],
  ["$toString", "Converts to string"],
  ["$toInt", "Converts to int"],
  ["$toLong", "Converts to long"],
  ["$toDouble", "Converts to double"],
  ["$toDecimal", "Converts to decimal"],
  ["$toDate", "Converts to date"],
  ["$toObjectId", "Converts to ObjectId"],
  ["$toBool", "Converts to boolean"],
  ["$convert", "Converts to a type, with error handling"],
  ["$getField", "Value of a field, even with dots in its name"],
  ["$objectToArray", "Document to array of k/v pairs"],
  ["$arrayToObject", "Array of k/v pairs to document"],
  ["$literal", "A value, unparsed"],
];

const UPDATE_OPERATORS: Op[] = [
  ["$set", "Sets fields"],
  ["$unset", "Removes fields"],
  ["$inc", "Increments by an amount"],
  ["$mul", "Multiplies by an amount"],
  ["$rename", "Renames fields"],
  ["$min", "Updates if the value is lower"],
  ["$max", "Updates if the value is higher"],
  ["$currentDate", "Sets to the current date"],
  ["$setOnInsert", "Sets fields only when upserting"],
  ["$push", "Appends to an array"],
  ["$addToSet", "Appends unless already present"],
  ["$pull", "Removes matching array elements"],
  ["$pullAll", "Removes all listed values from an array"],
  ["$pop", "Removes the first (-1) or last (1) element"],
  ["$each", "Several values for $push / $addToSet"],
];

const SYSTEM_VARIABLES: Op[] = [
  ["$$ROOT", "The top-level document"],
  ["$$CURRENT", "The current document in the pipeline"],
  ["$$NOW", "The current date-time"],
  ["$$REMOVE", "Removes the field it's assigned to"],
];

// ---------------------------------------------------------------- scanning

interface Opener {
  char: "{" | "[" | "(";
  index: number;
}

interface Scan {
  stack: Opener[];
  /** Set when the cursor is inside a string literal. */
  string: { quote: string; start: number } | null;
}

/** Brackets still open and string state at the end of `text`. */
function scan(text: string, jsComments: boolean): Scan {
  const stack: Opener[] = [];
  let string: Scan["string"] = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (string) {
      if (c === "\\") i++;
      else if (c === string.quote) string = null;
      continue;
    }
    if (jsComments && c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      if (end === -1) return { stack, string: null };
      i = end;
      continue;
    }
    if (jsComments && c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end === -1) return { stack, string: null };
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'" || (jsComments && c === "`")) {
      string = { quote: c, start: i };
    } else if (c === "{" || c === "[" || c === "(") {
      stack.push({ char: c, index: i });
    } else if (c === "}" || c === "]" || c === ")") {
      stack.pop();
    }
  }
  return { stack, string };
}

/** The last non-whitespace character before `index`. */
function charBefore(text: string, index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (!/\s/.test(text[i])) return text[i];
  }
  return "";
}

/** Whether position `index` is where an object key goes. */
function isKeyPosition(text: string, index: number, stack: Opener[]): boolean {
  const top = stack[stack.length - 1];
  const prev = charBefore(text, index);
  return top?.char === "{" && (prev === "{" || prev === ",");
}

/**
 * Which argument of the call opened at `from` the cursor (at `to`) is in:
 * commas directly inside the call, not inside nested brackets or strings.
 */
function argumentIndex(text: string, from: number, to: number): number {
  let depth = 0;
  let count = 0;
  let string: string | null = null;
  for (let i = from + 1; i < to; i++) {
    const c = text[i];
    if (string) {
      if (c === "\\") i++;
      else if (c === string) string = null;
    } else if (c === '"' || c === "'" || c === "`") string = c;
    else if ("{[(".includes(c)) depth++;
    else if ("}])".includes(c)) depth--;
    else if (c === "," && depth === 0) count++;
  }
  return count;
}

const CALL_ON_COLLECTION =
  /db\s*\.\s*(?:collection|getCollection)\s*\(\s*(["'`])([^"'`]*)\1\s*\)\s*\.\s*(\w+)\s*$/;

interface ConsoleCall {
  collection: string;
  method: string;
  arg: number;
  /** Brackets open inside the call, outermost first. */
  inner: Opener[];
}

/** The innermost `db.collection("x").method(` call the cursor is inside. */
function consoleCall(text: string, stack: Opener[]): ConsoleCall | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].char !== "(") continue;
    const m = CALL_ON_COLLECTION.exec(text.slice(0, stack[i].index));
    if (!m) continue;
    return {
      collection: m[2],
      method: m[3],
      arg: argumentIndex(text, stack[i].index, text.length),
      inner: stack.slice(i + 1),
    };
  }
  return null;
}

// ---------------------------------------------------------------- building

function ops(list: Op[], kind: SuggestionKind, detail: string, rank: number): Suggestion[] {
  return list.map(([name, doc], i) => ({
    label: name,
    insertText: name,
    kind,
    detail,
    documentation: doc,
    sortText: `${rank}${String(i).padStart(3, "0")}`,
  }));
}

function named(names: string[], kind: SuggestionKind, detail: string, rank: number): Suggestion[] {
  return names.map((name, i) => ({
    label: name,
    insertText: name,
    kind,
    detail,
    sortText: `${rank}${String(i).padStart(4, "0")}`,
  }));
}

/** Keeps the first suggestion per label: lists are passed in priority order. */
function unique(...lists: Suggestion[][]): Suggestion[] {
  const seen = new Set<string>();
  return lists.flat().filter((s) => !seen.has(s.label) && seen.add(s.label));
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Operators only once a `$` is typed, names only once letters are:
 * Monaco's fuzzy match would otherwise surface $strLenCP for "st". With
 * nothing typed yet everything shows, which is how stages get listed right
 * after a pipeline's opening quote.
 */
function byPrefix(items: Suggestion[], typed: string): Suggestion[] {
  if (typed === "") return items;
  const wantsOperator = typed.startsWith("$");
  return items.filter((s) => s.label.startsWith("$") === wantsOperator);
}

/**
 * How a key is written where the cursor is: bare inside quotes, quoted in
 * JSON, and in JavaScript bare unless it isn't a valid identifier (a dotted
 * path, say).
 */
function asKey(items: Suggestion[], quoted: "inside" | "json" | "js"): Suggestion[] {
  return items.map((s) => {
    if (quoted === "inside") return s;
    if (quoted === "json" || !IDENTIFIER.test(s.label)) {
      return { ...s, insertText: JSON.stringify(s.label) };
    }
    return s;
  });
}

async function fieldsOf(source: CompletionSource, collection: string | null) {
  if (!collection) return [];
  try {
    return await source.fields(collection);
  } catch {
    return [];
  }
}

async function collectionsOf(source: CompletionSource) {
  try {
    return await source.collections();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- entry

/**
 * Suggestions for the cursor at the end of `textBefore`.
 *
 * `collection` is the collection the editor queries (Browse); the console
 * works it out from `db.collection("…")` in the text.
 */
export async function suggest(
  textBefore: string,
  editor: CompletionEditor,
  collection: string | null,
  source: CompletionSource,
): Promise<CompletionResult> {
  const isJs = editor === "console";
  const { stack, string } = scan(textBefore, isJs);
  const none: CompletionResult = { items: [], replaceLength: 0 };

  // ------------------------------------------------ inside a string literal
  if (string) {
    const typed = textBefore.slice(string.start + 1);
    const beforeQuote = textBefore.slice(0, string.start);
    const result = (items: Suggestion[]) => ({ items, replaceLength: typed.length });

    if (isJs && /db\s*\.\s*(?:collection|getCollection)\s*\(\s*$/.test(beforeQuote)) {
      return result(named(await collectionsOf(source), "collection", "collection", 0));
    }
    // $lookup's "from" and $unionWith's "coll" name a collection
    if (/["']?(?:from|coll)["']?\s*:\s*$/.test(beforeQuote)) {
      return result(named(await collectionsOf(source), "collection", "collection", 0));
    }

    const call = isJs ? consoleCall(textBefore, stack) : null;
    const target = call?.collection ?? collection;
    const keyPosition = isKeyPosition(textBefore, string.start, stack);

    if (keyPosition) {
      const items = await keyItems(editor, stack, call, target, source);
      return result(byPrefix(items, typed));
    }
    // "$field" references inside aggregation expressions
    const inAggregation = editor === "pipeline" || call?.method === "aggregate";
    if (inAggregation && typed.startsWith("$")) {
      const refs = (await fieldsOf(source, target)).map((f) => `$${f}`);
      return result(
        unique(
          named(refs, "field", "field reference", 0),
          ops(SYSTEM_VARIABLES, "variable", "system variable", 1),
        ),
      );
    }
    return none;
  }

  // ------------------------------------------------ outside strings
  const typed = /[\w$]*$/.exec(textBefore)?.[0] ?? "";
  const tokenStart = textBefore.length - typed.length;

  // Member access (db.collection, .find) is typed in consoleApi.d.ts and
  // completed by Monaco's TypeScript service, with signatures.
  if (isJs && textBefore[tokenStart - 1] === ".") return none;

  if (isKeyPosition(textBefore, tokenStart, stack)) {
    const call = isJs ? consoleCall(textBefore, stack) : null;
    if (isJs && !call) return none;
    const target = call?.collection ?? collection;
    const items = asKey(
      await keyItems(editor, stack, call, target, source),
      isJs ? "js" : "json",
    );
    return { items: byPrefix(items, typed), replaceLength: typed.length };
  }
  return none;
}

/** What can go in an object key at the cursor, most likely first. */
async function keyItems(
  editor: CompletionEditor,
  stack: Opener[],
  call: ConsoleCall | null,
  collection: string | null,
  source: CompletionSource,
): Promise<Suggestion[]> {
  const fields = async (rank: number) =>
    named(await fieldsOf(source, collection), "field", "field", rank);

  switch (editor) {
    case "sort":
      return fields(0);
    case "filter":
      return unique(
        await fields(0),
        ops(QUERY_OPERATORS, "operator", "query operator", 1),
        ops(EXPRESSIONS, "operator", "expression", 2),
      );
    case "pipeline":
      return pipelineKeys(stack, fields);
    case "console": {
      if (!call) return [];
      const depth = call.inner.length;
      switch (call.method) {
        case "aggregate":
          return pipelineKeys(call.inner, fields);
        case "insertOne":
          return fields(0);
        case "updateOne":
          if (call.arg === 1 && depth === 1) {
            return ops(UPDATE_OPERATORS, "operator", "update operator", 0);
          }
          if (call.arg === 1) return fields(0);
          break;
        case "find":
          // option keys (limit, sort...) come from the declared option type
          if (call.arg === 1 && depth === 1) return [];
          if (call.arg === 1) return fields(0);
          break;
      }
      return unique(
        await fields(0),
        ops(QUERY_OPERATORS, "operator", "query operator", 1),
        ops(EXPRESSIONS, "operator", "expression", 2),
      );
    }
  }
}

/** Stage names directly inside the pipeline array; fields and expressions deeper. */
async function pipelineKeys(
  stack: Opener[],
  fields: (rank: number) => Promise<Suggestion[]>,
): Promise<Suggestion[]> {
  const atStage =
    stack.length === 2 && stack[0].char === "[" && stack[1].char === "{";
  if (atStage) return ops(STAGES, "stage", "stage", 0);
  return unique(
    await fields(0),
    ops(EXPRESSIONS, "operator", "expression", 1),
    ops(QUERY_OPERATORS, "operator", "query operator", 2),
  );
}
