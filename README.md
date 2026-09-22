# Mongo Studio

An open-source, cross-platform MongoDB GUI client built with Tauri (Rust) and React. Think NoSQLBooster/Compass, but self-hosted and hackable.
<img width="2784" height="1784" alt="image" src="https://github.com/user-attachments/assets/4a75614e-0aa0-4e48-b51e-71b372e9cc75" />


## Features

- **Multi-connection manager** - save any number of connections (paste a URI or fill in host/port), with advanced options: TLS (custom CA/client cert), SSH tunneling, auth mechanism/source, replica set, pool size, timeouts.
- **Secrets stored securely** - passwords and passphrases go through the OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service), with an encrypted-file fallback on headless Linux.
- **Browse & query** - a database/collection tree, a find bar (filter/sort/limit/skip), and an aggregation pipeline editor.
- **Embedded JS console** - a mongosh-style scripting console (`db.collection(name).find(...)`, `insertOne`, `updateOne`, `deleteOne`, `aggregate`, `countDocuments`, top-level `await`), backed by an embedded QuickJS runtime - no external `mongosh` binary required.
- **Indexes & Explain** - see each collection's indexes and usage stats (`$indexStats`), and run `explain` (query planner / execution stats / all plans) on the current query or pipeline.
- **CSV export** - streams a find or aggregate result straight to disk, with a choice between flattening nested fields into columns or keeping them as JSON text.
- **Copy / edit documents** - copy a document as JSON, or jump to the console with an `updateOne` script pre-filled for that document's `_id`.
- **Themes** - several built-in color themes (including a light one), picked from the sidebar.

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

## License

MIT - see [LICENSE](LICENSE).
