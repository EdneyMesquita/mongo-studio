import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/layout/AppErrorBoundary";
import "./lib/monaco";
import "./index.css";
import { installErrorLogging } from "./lib/log";
import { applyTheme, getStoredPreference, getStoredTheme } from "./lib/themes";

installErrorLogging();
applyTheme(getStoredTheme(), getStoredPreference());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
