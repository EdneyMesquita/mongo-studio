import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "./components/layout/AppShell";
import { DialogHost } from "./components/layout/DialogHost";
import { EditorArea } from "./components/layout/EditorArea";
import { MainToolbar } from "./components/layout/MainToolbar";
import { SidePanelHost } from "./components/layout/SidePanelHost";
import { StatusBar } from "./components/layout/StatusBar";
import { ToolStripe } from "./components/layout/ToolStripe";
import { useGlobalShortcuts } from "./components/layout/useGlobalShortcuts";
import { QuickOpenPalette } from "./components/palette/QuickOpenPalette";
import { useSuppressNativeContextMenu } from "./lib/useSuppressNativeContextMenu";

function App() {
  useSuppressNativeContextMenu();
  useGlobalShortcuts();

  return (
    <TooltipProvider delayDuration={400}>
      <AppShell
        toolbar={<MainToolbar />}
        stripe={<ToolStripe />}
        sidePanel={<SidePanelHost />}
        statusBar={<StatusBar />}
      >
        <EditorArea />
      </AppShell>
      <QuickOpenPalette />
      <DialogHost />
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
