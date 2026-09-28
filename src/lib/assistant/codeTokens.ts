/**
 * A small highlighter for proposals (JSON and JavaScript) on the app's
 * syntax palette: comments, keys, strings, operators, numbers, calls.
 * Monaco's colorizer would do more at a real cost per card; these blocks
 * only need to read like the editors they go into.
 */
export interface CodeToken {
  text: string;
  className?: string;
}

const RE =
  /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)(\s*:)?|(\b(?:const|let|var|await|async|new|return|if|else|for|of|in|function|true|false|null|undefined)\b)|(\$[A-Za-z]+)(?=\s*:)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_$][\w$]*)(?=\s*\()|(\b[A-Za-z_$][\w$]*)(?=\s*:)/g;

export function codeTokens(src: string): CodeToken[] {
  const out: CodeToken[] = [];
  let last = 0;
  for (const m of src.matchAll(RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: src.slice(last, at) });
    last = at + m[0].length;
    if (m[1]) out.push({ text: m[1], className: "text-code-comment italic" });
    else if (m[2] && m[3]) {
      out.push({ text: m[2], className: "text-json-key" });
      out.push({ text: m[3], className: "text-json-punct" });
    } else if (m[2]) out.push({ text: m[2], className: "text-json-string" });
    else if (m[4]) out.push({ text: m[4], className: "text-json-keyword" });
    else if (m[5]) out.push({ text: m[5], className: "text-json-key" });
    else if (m[6]) out.push({ text: m[6], className: "text-json-number" });
    else if (m[7]) out.push({ text: m[7], className: "text-json-bson" });
    else out.push({ text: m[8], className: "text-json-key" });
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}
