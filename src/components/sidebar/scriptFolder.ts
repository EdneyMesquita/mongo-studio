/**
 * The folder a script lives in, short: the home directory as "~", e.g.
 * "/home/ana/mongo-studio-scripts/a.js" -> "~/mongo-studio-scripts".
 */
export function scriptFolder(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const folder = cut > 0 ? path.slice(0, cut) : path;
  return folder.replace(/^(\/home\/[^/]+|\/Users\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)(?=$|[/\\])/, "~");
}
