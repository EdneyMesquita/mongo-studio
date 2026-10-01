# Mongo Studio

An open-source, cross-platform MongoDB GUI client built with Tauri (Rust) and React. Think NoSQLBooster/Compass, but self-hosted and hackable.
<img width="1392" height="892" alt="Screenshot 2026-09-28 at 07 17 49" src="https://github.com/user-attachments/assets/eed74248-2327-468b-a297-569b10b0483b" />


## Features

- **Multi-connection manager** - save any number of connections (paste a URI or fill in host/port), with advanced options: TLS (custom CA/client cert), SSH tunneling, auth mechanism/source, replica set, pool size, timeouts.
- **Secrets stored securely** - passwords and passphrases go through the OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service), with an encrypted-file fallback on headless Linux.
- **Browse & query** - a database/collection tree, a find bar (filter/sort/limit/skip), and an aggregation pipeline editor.
- **Embedded JS console** - a mongosh-style scripting console (`db.collection(name).find(...)`, `insertOne`/`insertMany`, `updateOne`/`updateMany`, `deleteOne`/`deleteMany`, `aggregate`, `countDocuments`, top-level `await`), backed by an embedded QuickJS runtime - no external `mongosh` binary required.
- **Assistant (opt-in)** - ask for filters, pipelines and scripts in plain words, answered by the Claude Code or Codex CLI you already have installed and signed in (Mongo Studio holds no API key). The agent reads your server only through read-only tools the app serves over a local MCP server; its shell and file tools are off, `$out`/`$merge` are refused, and reading document values asks you first. Pick the model and effort per agent (a cheaper one for quick filters, a stronger one for hard pipelines), or keep the CLI's own default. Proposals come back as cards you apply to the query bar or open in a console; nothing it writes runs until you press Run. Ctrl/Cmd+L opens it, Ctrl/Cmd+I asks in place in a filter or a console.
- **Indexes & Explain** - see each collection's indexes and usage stats (`$indexStats`), and run `explain` (query planner / execution stats / all plans) on the current query or pipeline.
- **CSV export** - streams a find or aggregate result straight to disk, with a choice between flattening nested fields into columns or keeping them as JSON text.
- **Copy / edit documents** - copy a document as JSON, or jump to the console with an `updateOne` script pre-filled for that document's `_id`.
- **Themes** - several built-in color themes (including a light one), picked from the sidebar.

## Logs

Mongo Studio keeps a log file, so a failed connection or a crash can be looked into after the fact. To find it, open the command palette (Ctrl/Cmd+K) and choose **Open logs folder**. The crash screen has the same button. The file is `mongo-studio.log` in:

| OS | Folder |
| --- | --- |
| Windows | `%LOCALAPPDATA%\com.matheuscaet.mongo-studio\logs`; from the Microsoft Store, `%LOCALAPPDATA%\Packages\<package>\LocalState\logs` |
| macOS | `~/Library/Logs/com.matheuscaet.mongo-studio` |
| Linux | `$XDG_DATA_HOME/com.matheuscaet.mongo-studio/logs`, usually `~/.local/share/com.matheuscaet.mongo-studio/logs` |

When the file reaches 5 MB it is renamed with a timestamp and a new one is started. The five most recent old files are kept.

**What's logged:** app start (version, OS, log folder) and exit; the secret store in use (OS keychain or encrypted file) and keychain errors; connect, disconnect and connection tests, each with the connection's name and id, its hosts, whether an SSH tunnel is used, the result or error, the server version and how long it took; saving, deleting, importing and exporting connections (counts, import warnings, and whether each imported connection came with a password); every failed command and its error; database operations that fail or take longer than 5 seconds, with the operation, the `database.collection` and the time taken; Assistant CLI detection (path, version), start, stop and exit; panics and frontend errors, including crashes of the interface.

**What's never logged:** passwords, passphrases or other secrets; connection strings (only the hosts, with no user or options); filters, pipelines, scripts or documents. When a query fails, only the kind of error and the server's error code are written, because the server's message can quote your data.

## Development

Prerequisites:

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (via `rustup`)
- Tauri's platform prerequisites: see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/) (Linux needs a few system packages; macOS/Windows just need their standard build tools)

```sh
npm install
npm run tauri dev
```

Backend tests:

```sh
cd src-tauri
cargo test
```

Some integration tests talk to a real MongoDB instance and are marked `#[ignore]` by default. Point `MONGO_STUDIO_TEST_URI` at a database you're OK writing test data to, then run them explicitly:

```sh
export MONGO_STUDIO_TEST_URI="mongodb://localhost:27017/test"
cargo test --lib -- --ignored
```

## Building

```sh
npm run tauri build
```

Produces a platform-native installer (`.dmg`/`.app` on macOS, `.msi`/`.exe` on Windows, `.deb`/`.rpm`/`.AppImage` on Linux) under `src-tauri/target/release/bundle/`.

### Regenerating the app icon

The source design is `src-tauri/icons/icon-source.svg`. After editing it, regenerate every platform variant with:

```sh
npx tauri icon src-tauri/icons/icon-source.svg
```

## Releasing

Pushing a tag matching `vX.Y.Z` (e.g. `v0.2.0`) triggers `.github/workflows/release.yml`, which builds installers for macOS (universal binary), Windows, and Linux and attaches them to a **draft** GitHub release for review before publishing. You can also trigger it manually from the Actions tab. Builds are unsigned, so first launches will trip Gatekeeper (macOS) or SmartScreen (Windows) warnings until code signing is set up separately.

For the Microsoft Store, `.github/workflows/microsoft-store.yml` builds an MSIX package that the Store signs itself, so it needs no certificate. Once set up, it submits each published release to the Store by itself. [docs/microsoft-store.md](docs/microsoft-store.md) walks through the one-time Partner Center setup and the first submission. The privacy policy the Store asks for is [PRIVACY.md](PRIVACY.md).

## License

MIT - see [LICENSE](LICENSE).
