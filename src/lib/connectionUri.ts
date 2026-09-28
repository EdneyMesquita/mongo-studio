/** One fact read out of a connection string, shown as a chip under it. */
export interface UriFact {
  label: string;
  /** Absent for flags that are just present, like "direct". */
  value?: string;
  /** Plain text after the value, e.g. "(SRV)". */
  suffix?: string;
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function flag(value: string | null): string | null {
  if (value === null) return null;
  return value.toLowerCase() === "true" ? "on" : value.toLowerCase() === "false" ? "off" : value;
}

/**
 * What a mongodb:// or mongodb+srv:// string says, for a quick visual check.
 * Never shows the password. Returns [] for anything it can't read - the
 * backend is the one that validates.
 */
export function describeConnectionUri(uri: string): UriFact[] {
  const match = /^(mongodb(?:\+srv)?):\/\/([^/?#]*)(?:\/([^?#]*))?(?:\?([^#]*))?/.exec(uri.trim());
  if (!match) return [];
  const [, scheme, authority, path, query] = match;
  const srv = scheme === "mongodb+srv";

  const at = authority.lastIndexOf("@");
  const userinfo = at >= 0 ? authority.slice(0, at) : "";
  const hosts = (at >= 0 ? authority.slice(at + 1) : authority).split(",").filter(Boolean);
  if (hosts.length === 0) return [];

  const params = new URLSearchParams(query ?? "");
  // option names are case-insensitive in the spec
  const option = (name: string): string | null => {
    for (const [key, value] of params) if (key.toLowerCase() === name.toLowerCase()) return value;
    return null;
  };

  const facts: UriFact[] = [
    { label: "hosts", value: hosts.join(", "), suffix: srv ? "(SRV)" : undefined },
  ];
  const user = userinfo.split(":")[0];
  if (user) facts.push({ label: "user", value: decode(user) });
  const database = decode(path ?? "");
  if (database) facts.push({ label: "database", value: database });
  const authSource = option("authSource");
  if (authSource) facts.push({ label: "auth source", value: authSource });
  const replicaSet = option("replicaSet");
  if (replicaSet) facts.push({ label: "replica set", value: replicaSet });
  // mongodb+srv turns TLS on unless the string says otherwise
  const tls = flag(option("tls") ?? option("ssl")) ?? (srv ? "on" : null);
  if (tls) facts.push({ label: "TLS", value: tls });
  const direct = flag(option("directConnection"));
  if (direct === "on") facts.push({ label: "direct" });
  return facts;
}
