import { bsonLiteral, isPlainObject } from "../../lib/bsonValue";

/** 1 / -1 read as numbers; "text", "2dsphere", "hashed" as strings. */
function directionClass(direction: unknown): string {
  return typeof direction === "string" ? "text-json-string" : "text-json-number";
}

function directionText(direction: unknown): string {
  if (typeof direction === "string" || typeof direction === "number") return String(direction);
  return bsonLiteral(direction) ?? JSON.stringify(direction);
}

/** An index key as one chip per field, direction or type in syntax colour. */
export function IndexKeyChips({ indexKey }: { indexKey: unknown }) {
  if (!isPlainObject(indexKey)) {
    return <span className="font-data text-fg-2">{JSON.stringify(indexKey)}</span>;
  }
  return (
    <span className="inline-flex gap-1">
      {Object.entries(indexKey).map(([field, direction]) => (
        <span key={field} className="rounded-sm bg-fg/7 px-1.5 py-px font-data text-sm">
          {field} <span className={directionClass(direction)}>{directionText(direction)}</span>
        </span>
      ))}
    </span>
  );
}
