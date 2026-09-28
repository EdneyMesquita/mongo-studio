# Privacy policy

Mongo Studio is a desktop app that runs on your computer. It has no account and no telemetry, and the project runs no server that the app talks to.

## What stays on your computer

- **Connections:** the connections you save, including names, addresses and settings, are stored on your computer. Passwords and passphrases go to your system's credential store (Windows Credential Manager, macOS Keychain, or Secret Service on Linux), or to an encrypted file where none is available.
- **Your data:** the app connects only to the MongoDB servers you set up. It reads and writes their data only when you ask it to: opening a collection, running a query or script, editing a value.
- **Your files:** scripts and exports are saved only where you choose.

## The Assistant (optional)

The Assistant is off until you set it up. When it's on, it runs an AI coding agent that is already installed on your computer and signed in with your own account: Claude Code (by Anthropic) or Codex (by OpenAI).

- Your messages, and what the agent reads through the app's read-only tools, are sent to that agent's provider under the terms of your account with them.
- What the agent reads is limited to the connections you allow in the Assistant's settings: collection names, field names and types, indexes and query plans. It reads document values only if you allow it, each time or always for a connection.
- Mongo Studio itself stores no API key and sends nothing to Anthropic or OpenAI on its own.

## Contact

Questions about privacy: open an issue at <https://github.com/matheuscaet/mongo-studio/issues>.
