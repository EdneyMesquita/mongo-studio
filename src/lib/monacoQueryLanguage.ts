import type * as Monaco from "monaco-editor";

/**
 * The language of the filter, sort and pipeline fields: JSON plus what
 * mongosh accepts (see queryText.ts). Monaco's own JSON mode would
 * underline every unquoted key and ObjectId("…") as an error, and its
 * JavaScript mode would run the TypeScript service over a field that
 * isn't a program - so the fields get a small language of their own:
 * colours from a tokenizer, no validation worker. QueryEditor marks the
 * parser's own errors instead.
 */
export const QUERY_LANGUAGE = "mongo-query";

// Token names reuse the JSON ones, so the app themes colour keys and
// values the way they did when the fields were JSON.
const tokens: Monaco.languages.IMonarchLanguage = {
  defaultToken: "invalid",
  tokenizer: {
    root: [
      [/\s+/, "white"],
      [/\/\/.*$/, "comment"],
      [/\/\*/, "comment", "@comment"],
      // keys: anything followed by a colon
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "string.key.json"],
      [/'(?:[^'\\]|\\.)*'(?=\s*:)/, "string.key.json"],
      [/[A-Za-z_$][\w$]*(?:\.[\w$]+)*(?=\s*:)/, "string.key.json"],
      // values; an unterminated string still colours as one while typing
      [/"(?:[^"\\]|\\.)*"?/, "string.value.json"],
      [/'(?:[^'\\]|\\.)*'?/, "string.value.json"],
      // no division in a query: a slash that isn't a comment opens a regex
      [/\/(?:[^/\\[\n]|\\.|\[(?:[^\]\\\n]|\\.)*\]?)+\/[A-Za-z]*/, "regexp"],
      [/(?:true|false|null)\b/, "keyword.json"],
      [/new\b/, "keyword"],
      [/(?:NaN|Infinity|MinKey|MaxKey)\b/, "type"],
      // ObjectId(, ISODate(, NumberDecimal(…
      [/[A-Za-z_$][\w$]*(?=\s*\()/, "type"],
      [/[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|Infinity)/, "number"],
      [/[A-Za-z_$][\w$]*/, "identifier"],
      [/[{}[\]()]/, "delimiter.bracket"],
      [/[,:]/, "delimiter"],
    ],
    comment: [
      [/[^*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/\*/, "comment"],
    ],
  },
};

const configuration: Monaco.languages.LanguageConfiguration = {
  comments: { lineComment: "//", blockComment: ["/*", "*/"] },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}", notIn: ["string"] },
    { open: "[", close: "]", notIn: ["string"] },
    { open: "(", close: ")", notIn: ["string"] },
    { open: '"', close: '"', notIn: ["string", "comment"] },
    { open: "'", close: "'", notIn: ["string", "comment"] },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  wordPattern: /(-?\d*\.\d\w*)|([^\s`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?]+)/g,
};

export function registerQueryLanguage(monaco: typeof Monaco) {
  monaco.languages.register({ id: QUERY_LANGUAGE });
  monaco.languages.setMonarchTokensProvider(QUERY_LANGUAGE, tokens);
  monaco.languages.setLanguageConfiguration(QUERY_LANGUAGE, configuration);
}
