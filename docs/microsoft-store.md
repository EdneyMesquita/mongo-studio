# Publishing to the Microsoft Store

Mongo Studio goes to the Store as an **MSIX** package. The Store signs MSIX packages itself after certification, so this needs no code-signing certificate, and Store installs update automatically. Packaging runs on GitHub Actions (`.github/workflows/microsoft-store.yml`), so no Windows machine is needed to publish.

## One-time setup

1. **Partner Center account.** Sign up at [Partner Center](https://partner.microsoft.com/dashboard/registration) as an individual or a company. Registration is free for both.
2. **Reserve the name.** In *Apps and games*, choose *New product* > *MSIX or PWA app* and reserve **Mongo Studio**. If the name is taken, reserve another one and set it as `MSSTORE_DISPLAY_NAME` (step 4).
3. **Copy the package identity.** Open the app > *Product management* > *Product identity* and copy:
   - `Package/Identity/Name`, e.g. `12345Publisher.MongoStudio`
   - `Package/Identity/Publisher`, e.g. `CN=00000000-0000-0000-0000-000000000000`
   - `Package/Properties/PublisherDisplayName`
4. **Repository variables.** In GitHub, open *Settings* > *Secrets and variables* > *Actions* > *Variables* and add:

   | Variable | Value |
   |---|---|
   | `MSSTORE_IDENTITY_NAME` | Package/Identity/Name |
   | `MSSTORE_PUBLISHER` | Package/Identity/Publisher |
   | `MSSTORE_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName |
   | `MSSTORE_DISPLAY_NAME` | Only when the reserved name isn't "Mongo Studio" |

   None of these is secret: they are printed in the package itself.

## Building a package

Pushing a `vX.Y.Z` tag builds the package along with the other release installers. You can also build it at any time from *Actions* > *Microsoft Store* > *Run workflow*. When the run finishes, download the **msix-microsoft-store** artifact: a zip holding `MongoStudio_X.Y.Z.0_x64.msix`.

Two versioning rules apply:

- The package version is the app version from `src-tauri/tauri.conf.json` with a `.0` appended. The Store reserves that fourth part.
- Every submission needs a higher version than the last one.

If the artifact is called **msix-placeholder-identity-not-for-upload**, the variables weren't set. That run only checked that packaging works.

## First submission

In Partner Center, open the app and start a submission:

1. **Pricing and availability:** Free, and the markets to publish in.
2. **Properties:**
   - **Category:** *Developer tools*.
   - **Privacy policy URL:** point it to [`PRIVACY.md`](../PRIVACY.md) on GitHub. It's required because the app connects to the network, and because the opt-in Assistant sends data to the provider of the agent the user chose.
   - **Support contact:** the repository's issues page works.
3. **Age ratings:** the questionnaire. It's a developer tool with no user-generated content shared between users.
4. **Packages:** upload the `.msix` and keep the *Desktop* device family.
5. **Store listings:**
   - A description, at least one screenshot (1366×768 or larger) and search terms.
   - The app icon comes from the package.
6. **Submission options > Restricted capabilities:** the package declares `runFullTrust`, like any packaged desktop app. The field takes at most 500 characters; this text fits:

   > Mongo Studio is a Win32 desktop app (Rust + WebView2) packaged as MSIX; runFullTrust is required for its Windows.FullTrustApplication entry point. It uses it to connect to the user's MongoDB servers (TLS, SSH tunnels), keep passwords in Windows Credential Manager, save scripts and exports where the user chooses, and, for the optional Assistant, run the user's own Claude Code or Codex CLI. No admin rights, drivers, services or telemetry.

7. Submit. Certification usually takes from a few hours to three business days.

## Updates

Bump the version in `src-tauri/tauri.conf.json` and push the tag. Then start a new submission with the new `.msix`. Store installs update themselves once it's certified.

## Good to know

- **Settings live apart from the MSI/EXE install.** Windows keeps a packaged app's `AppData` separately, so the Store version doesn't see the connections of an installer version, and the other way round. Move them with *Import / export connections*. Saved scripts stay in the folders the user picked.
- **WebView2.** The package relies on the WebView2 runtime that ships with Windows 11, and with Microsoft Edge on Windows 10.
- **Only x64 for now.** Windows on Arm runs x64 apps under emulation. A native Arm64 package can be added with `-Arch arm64` and an `aarch64-pc-windows-msvc` build.
- **Installing a package outside the Store.** A package has to be signed before Windows installs it. To try one locally before submitting, sign it with a self-signed certificate whose subject matches `MSSTORE_PUBLISHER`, then trust that certificate on the test machine. [Microsoft's guide](https://learn.microsoft.com/windows/msix/package/sign-app-package-using-signtool) covers both steps. The Store's own certification also runs the app before it's published.
