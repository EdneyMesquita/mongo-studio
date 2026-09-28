import { useEffect, useState } from "react";
import { Command, CommandEmpty, CommandInput, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useScriptsStore } from "../../store/scriptsStore";
import { useUiStore } from "../../store/uiStore";
import { PaletteActions } from "./PaletteActions";
import { PaletteCollections } from "./PaletteCollections";
import { PaletteScripts } from "./PaletteScripts";

/**
 * Items carry a unique value (the same collection can live on two servers);
 * what's matched is their keywords: the label first, then where it lives.
 * Every typed word must appear somewhere; a hit in the label ranks higher.
 */
function matchKeywords(_value: string, search: string, keywords: string[] = []) {
  const query = search.trim().toLowerCase();
  if (!query) return 1;
  const [label = "", ...rest] = keywords.map((k) => k.toLowerCase());
  const haystack = [label, ...rest].join(" ");
  if (!query.split(/\s+/).every((word) => haystack.includes(word))) return 0;
  if (label.startsWith(query)) return 1;
  if (label.includes(query)) return 0.8;
  return 0.5;
}

/** Ctrl+K: jump to any listed collection, saved script or action. */
export function QuickOpenPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    // the list on disk may have changed since the panel last read it
    useScriptsStore.getState().refresh();
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[72px] w-[min(600px,calc(100%-32px))] max-w-none translate-y-0 bg-popover sm:max-w-none"
      >
        <DialogTitle className="sr-only">Quick open</DialogTitle>
        <DialogDescription className="sr-only">
          Search collections, saved scripts and actions
        </DialogDescription>
        <Command
          filter={matchKeywords}
          loop
          className="bg-transparent **:data-[slot=command-input-wrapper]:h-[46px] **:data-[slot=command-input-wrapper]:gap-2.5 **:data-[slot=command-input-wrapper]:border-line **:data-[slot=command-input-wrapper]:px-3.5"
        >
          <div className="relative">
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search collections, scripts and actions"
              // the global focus outline is unlayered, so only !important beats it
              className="pr-10 outline-none!"
            />
            <Kbd className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2">Esc</Kbd>
          </div>
          <CommandList className="max-h-[360px] p-1.5">
            <CommandEmpty>Nothing matches “{search}”.</CommandEmpty>
            <PaletteCollections search={search} run={run} />
            <PaletteScripts search={search} run={run} />
            <PaletteActions search={search} run={run} />
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
