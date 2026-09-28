# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Desktop app: a Tauri 2 shell around a React web view, shipped for macOS, Windows and Linux. The UI is web technology in a native window, with native file dialogs, OS keychain and menus from Tauri.)

## Users

Backend developers who spend much of their day inside their MongoDB data across several environments (local, staging, production): finding a document, checking why a query behaves as it does, fixing a value, running a quick script, comparing the same collection on two servers.

## Product Purpose

An open-source, cross-platform MongoDB GUI client: browse and query collections, run aggregation pipelines, script against a database, inspect indexes and explain plans, edit documents in place and export results - without installing mongosh or signing into anything. Success is a developer getting to the right document or answer faster than with Compass, NoSQLBooster or a terminal.

## Positioning

- **Light and offline:** a small native app, MIT-licensed, that works fully offline with no account and no telemetry; Monaco and every asset are bundled.
- **Several servers at once:** many live connections side by side, each tab bound to its own connection, so environments can be compared directly.
- **Embedded console:** a mongosh-style JavaScript console backed by an embedded QuickJS runtime - no external mongosh binary.

## Operating Context

Used for long stretches next to an IDE and a terminal, often on a laptop screen. Typical loop: connect to one or more servers, open a database, open collections as tabs, filter/sort/aggregate, read results as a tree or table, double-click to edit a value, open a console on a database for ad-hoc scripts, save scripts to disk, export CSV.

## Capabilities and Constraints

- Connections: URI or host/port form with General/TLS/SSH/Advanced sections; an optional identity color per connection (an automatic one otherwise); secrets in the OS keychain; import/export in Compass's JSON format (selective import); organized in nested folders; menus to connect, disconnect, edit, delete; any number connected at once.
- Explorer and Saved scripts tool windows (resizable); one search box for connections and collections; databases and collections as a tree, collections sorted by name; a Ctrl+K quick open for collections, saved scripts and actions.
- Tabs: collection tabs (Documents, Indexes, Console views) and console tabs, from any number of connections; each tab shows its collection or console and its connection, underlined in the connection's color.
- Documents: Find (filter, sort, limit, skip) and Aggregate (pipeline) with MongoDB-aware completion; Explain; results as a document grid with the selected document in an inspector, a JSON tree, or raw JSON; inline value editing; export of the whole query to CSV or JSON.
- Console: Monaco JS editor with completion, run/cancel, Result and Logs, stacked or side-by-side layout with a resizable split, save to a local .js file (Ctrl/Cmd+S), saved scripts in their own tool window, export of the result to CSV or JSON.
- Indexes: list with usage stats.
- Assistant (opt-in): drives an AI coding agent CLI already installed and signed in on the machine - Claude Code or Codex - never an API key of the app's own. A tool window docked right (Ctrl/Cmd+L) holds sessions bound to one database of one connection; Ctrl/Cmd+I asks in place in a filter bar or a console and shows the change as a diff to accept or reject. The agent reads the server only through read-only tools the app serves over a local MCP server (list collections, sample the schema, find and aggregate with a limit, explain, count); its own shell and file tools are off, `$out`/`$merge` are refused, document values need the user's permission unless allowed in settings, and connections are shared one by one (localhost ones start allowed). It proposes filters, pipelines and console scripts as cards with a read-only dry run; writes come back as scripts that run only when the user presses Run.
- Terminology: connection, database, collection, document, filter, sort, pipeline, console, saved script, tab, Assistant, session, proposal.

## Brand Commitments

- Name: Mongo Studio. An app icon exists at `src-tauri/icons/icon-source.svg`.
- Appearance: one visual identity in a light and a dark version (DESIGN.md); the earlier editor-style themes were replaced by the redesign.
- UI copy is in English.
- Standing preference (chosen 2026-09-26 in the redesign direction round): the category standard, a dense IDE-style tool, executed at full craft - it should sit comfortably next to DataGrip / JetBrains New UI, VS Code and Linear, whose finish sets the quality bar.

## Evidence on Hand

Sample data lives only in contributors' local dev databases (not in the repo). No customers, testimonials or usage numbers exist; none may be invented.

## Product Principles

1. The data is the interface: documents, fields and types get the space and the clearest type; chrome recedes.
2. Always show where you are: which server, database and collection every tab, query and console runs against.
3. Fast by keyboard, fine by mouse: every frequent action has a shortcut and a visible control.
4. Nothing leaves the machine: no account, no network beyond the user's own servers. The one exception is the Assistant, off until the user sets it up: then their messages, and what the agent reads through the read-only tools, go to the agent's provider (Anthropic or OpenAI) under the user's own CLI account - said plainly in its setup.
