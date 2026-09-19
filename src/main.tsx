import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lib/monaco";
import "./index.css";
import { applyTheme, getStoredTheme } from "./lib/themes";

applyTheme(getStoredTheme());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
