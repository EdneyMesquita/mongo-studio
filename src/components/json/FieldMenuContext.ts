import { createContext } from "react";
import type { MenuEntry } from "../common/ActionMenu";

/**
 * The right-click menu of a document's field, given the document and the
 * field's path in it. Present only under a collection's results; without it
 * (console output) fields have no menu.
 */
export const FieldMenuContext = createContext<((doc: unknown, path: string[]) => MenuEntry[]) | null>(null);
