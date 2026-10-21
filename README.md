# Version Updater for After Effects

A dockable Windows CEP panel for finding and importing newer versions of selected footage, including EXR/PNG image sequences stored in sibling 3D render revision folders.

**Current version: 1.5.2.** Tested in After Effects 2026 (26.5x89), including native composition scans, scoped source swaps, grouped multipass sequence imports and multiple duplicate comps. The manifest supports AE 22 and later with CEP support; other versions have not been verified. Adobe MCP is optional and is not required to use the updater.

## Install or update

1. Close After Effects. [Download the signed Version Updater 1.5.2 ZIP](https://github.com/NickPittas/Version_Updater/raw/refs/heads/main/downloads/Version-Updater-1.5.2.zip) and extract it to a local folder.
2. Double-click **install.cmd**, or run the following command from the extracted folder:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
   ```

3. Open **Window > Extensions > Version Updater** in After Effects. On first installation, restart AE if the panel is not listed.
4. Start After Effects after installing an update. The installer refuses to change installed files while AE is running, including when its panel is closed, because CEP can retain a locked cache.

The same installer handles first installs and updates. No administrator access or Node.js installation is needed. It stages and verifies the complete package before swapping installations, keeps the previous copy under `%LOCALAPPDATA%\VersionUpdater\install-backups`, and resets only Version Updater's CEP cache. It preserves existing CEP registry keys and other extensions' caches. It installs the extension to:

```text
%APPDATA%\Adobe\CEP\extensions\com.nickpittas.versionupdater
```

The release includes an Adobe-tool-verified, locally self-signed CEP package (`META-INF/signatures.xml` and `mimetype`). The installer requires these signing files and makes no debug-mode registry changes. It does not change footage files or save your AE project. Updates are installed manually by downloading the new ZIP and running the installer again.

### Blank panels / signature failures

On the affected AE 2026 / CEP 12 installation, both custom panels were rejected with `Signature verification failed`, even while `PlayerDebugMode` was the documented string value `1`. Version 1.5.2 packages the updater with a signature instead of relying on that bypass. The installed MCP panel was separately signed without changing its application code. Signing uses [Adobe's ZXPSignCmd](https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD); no certificate is added to the Windows trust store.

The updater writes temporary request scripts and responses under the user's `VersionUpdater` data directory. It never writes into its signed installation. Changing any installed source file invalidates its signature: rebuild and re-sign before reinstalling.

## Use

1. Select footage or one or more compositions in the Project bin, or select layers in an open timeline. Selected Project-bin compositions expand to all their direct file-footage layers; shared sources appear once, with layer targets captured in each selected composition. Nested precomps are not expanded.
2. Choose **Project bin**, **Timeline**, or **Auto**. Auto prefers selected layers in the active composition, then Project selection.
3. Click **Scan selection**. Check the assets to update and choose a version/revision from each row's dropdown. **Latest available** is the default; older compatible revisions can also be selected. The current version is marked and disabled. Paths are collapsed under **Show target path**.
4. Choose an update action and an **Updated version label**. Optionally enable **Apply in a duplicate composition** for replacement or layer addition.
5. Click **Apply checked updates**. The batch can be undone with **Edit > Undo**.

| Action | Project bin | Timeline |
| --- | --- | --- |
| **Replace existing footage** | Replaces each checked footage item's source in place | Every layer using that source updates throughout the project |
| **Update layers in selected comp only** | Imports new sources and retains the original footage | Swaps sources only on captured layers in scanned composition(s); other comps retain their sources |
| **Import selected versions to Project bin only** | Imports new footage into the original bin folder and retains the original | Leaves all layers unchanged; no open composition is needed |
| **Add new layers above originals** | Imports new footage and retains the original | Duplicates each targeted layer directly above its original and assigns the new source |

Bin-only and add-layer actions import a fresh copy, even if the chosen file already exists elsewhere in the project. They preserve still/sequence mode and copy compatible interpretation settings; unsupported settings produce warnings.

### Sequence version folders

Whenever an action imports a new sequence instead of replacing a bin source in place, the sequence is placed in an AE Project-bin version subfolder, such as `card_12`. Matching albedo, diffuse, reflections and other passes from a named `card_r12` render folder share that folder. For plain `r12` folders or same-folder file versions, the name is derived from the sequence filename with the version, frame number and recognized pass suffix removed. Unrecognized filename suffixes are retained to avoid grouping unrelated assets. Stills remain in the original bin folder.

Folders are created below the original bin folder and reused by name. When the source already lives in a generated `card_11` folder, `card_12` is created/reused beside it rather than nested inside it. Separate original bin locations retain separate version folders. These are virtual AE Project-bin folders; nothing is created or moved on the NAS.

### Duplicate compositions and layer targeting

**Apply in a duplicate composition** duplicates the scanned top-level composition and applies replacement or layer addition there. Replacement in this mode imports new footage and changes only the targeted layer sources in the duplicate. Original sources and the original composition remain unchanged. Nested precomps remain shared. Duplicate names are made unique automatically. This option is unavailable for bin-only imports.

For comp-only, add-layer and duplicate-comp actions, select the intended compositions in the Project bin and use **Project bin** selection, or open the intended composition before scanning footage/layers. Timeline selection targets only the captured selected layer instances. Project footage selection targets matching direct layers in the open comp. Explicitly selected Project-bin comps take precedence over the open comp; with multiple comps selected, duplicate mode creates a separate duplicate for each targeted comp. The preview shows the total targeted layer count. Saved composition/layer IDs prevent later selection changes from redirecting edits. Sources absent from the captured compositions are skipped.

Added layers preserve timing, transforms, effects, masks, keyframes, switches and lock states. Original layers remain enabled. Both layers can contribute transparent pixels or audio; disable/mute originals yourself when appropriate. New duration or dimensions can affect the result. Changed starting frames are flagged but are not automatically retimed.

### Labels

**Auto · different from original** chooses label slot 9 (normally Green), or slot 10 (normally Purple) if the original already uses slot 9. You can choose an explicit AE label or keep existing labels. Names and colors follow your AE label preferences.

Bin-only, add-layer and duplicate-comp actions label only newly imported/updated items and layers. Global replacement labels the replaced footage item and every layer using it. Label changes are included in the same Undo step.

## Version and sequence matching

- Explicit tokens include `shot_v001.mov`, `shot.ver002.wav`, `shot version003.png`, and `shot_r12.exr`. The last explicit token is used. Version numbers compare numerically: `r105` is newer than `r22`.
- Ordinary files are matched in their source folder. Other filename text, case and extension must match; numeric version padding may differ. Unversioned sources are skipped.
- For render sources inside folders such as `r18`, `Sailboat_r12`, or `sh10_r101`, the panel discovers matching sibling revision folders. Nested paths such as `r18/reflections` are preserved in each revision.
- The nearest revision-bearing ancestor defines the boundary. Lookup is limited to eight levels and stops at `RENDERs` or a filesystem root. It does not recursively search the NAS or other shots.
- Render matching ignores filename case and normalizes the separator before a sequence frame number (`_0000.exr` / `.0000.exr`). Shot, variant, pass, extension and frame padding must remain compatible. `Vertical`, `ntsc`, `layers`, and `c03` variants stay separate.
- Dropdowns contain only compatible versions. For example, a PNG in `Sailboat_r10` lists r11 and r10 when later folders contain only EXRs. Format conversion is not inferred.
- An image sequence is handled as one AE footage asset, retaining sequence import mode and using its lowest numbered matching frame. Still imports remain stills, including numbered still filenames.
- Empty revisions and missing passes are skipped. Ambiguous candidate families are reported rather than guessed. Latest mode never automatically downgrades; explicit older-version choices are supported.
- Gaps, fewer frames or a changed frame range produce warnings and begin unchecked. Check those rows explicitly when intentional. Filename checks cannot certify that a render has finished writing.
- Apply revalidates the source path, still/sequence mode and chosen target. Stale previews and changed targets are rejected. Successful items remain undoable together if another item fails.

Missing original media can be relinked when its recorded source folder is available. Solids, generated sources, compositions and folders are skipped; selection is not recursively expanded. Proxies are not versioned. Layered Photoshop/Illustrator imports are not rebuilt as compositions.

## NAS performance

Scanning reads folder/file names, not EXR/PNG image payloads or every frame's headers, sizes or timestamps. The panel queries sibling revision names and uses masks restricted to the required revision, pass, extension and frame padding. Filtered listings are cached across selected assets within each request; Apply and explicit version changes use fresh caches.

To check dropdown compatibility, sequences first probe a known frame number, normally returning at most one filename per revision. Cached listings are reused. A missing probe falls back to a filtered sequence-family query so a revision with a shifted frame range remains discoverable. The selected revision receives complete filename-based frame count/range/gap checks in linear time, without sorting every frame.

These choices reduce directory entries transferred to the panel. Actual SMB/NAS internal I/O depends on the server. Only importing/replacing media in AE reads the image data.

## Development and verification

The release includes the generated ExtendScript bundle, so users do not need build tools. For development, install Node.js and run:

```powershell
node build.cjs
node tests/version-core.test.cjs
node tests/render-versions.test.cjs
node tests/transport.test.cjs
node tests/comp-versions.test.cjs
```

Edit `extension/jsx/host-main.js` and `extension/jsx/version-core.js`, rebuild, then re-sign and reinstall with `powershell -ExecutionPolicy Bypass -File .\repair-signatures.ps1` while AE is closed. The helper downloads Adobe's signing tool if needed and keeps its generated certificate/password outside the repository under `%LOCALAPPDATA%\VersionUpdater\signing`. Do not distribute those private signing files. The optional `-IncludeMcp` switch also signs the existing local MCP panel. The release ZIP contains the already signed updater and needs no signing tools.

`build.cjs` bundles JSON support, matching and host code into `host.jsx` without relative includes. CEP requests use short `evalFile` calls and unique temporary JSON responses to handle empty Windows script callbacks; request/response files are cleaned up after reading.

Native fixture scripts under `tests/` verify bin-only still/sequence imports, replacement, layer addition, duplicate compositions, labels, source/layer preservation, older-version choices, stale-preview rejection and shared directory caches in AE. They need a local AE installation and local fixture paths adjusted for the machine. Recorded production-project reports and source media are not required for installation.

Read-only checks on three NAS render roots confirmed sibling revisions, nested reflection passes, numerical ordering, empty-folder fallback, PNG/EXR isolation and shifted frame ranges. Native isolated sequence fixtures verified cross-folder replacement and imports. Production render files were not modified by those checks.

## Changes

- **1.5.2:** Signed CEP package for hosts rejecting unsigned panels despite debug mode. Move temporary request scripts outside the installation so scanning cannot invalidate the signature. Installer no longer changes CEP debug-mode settings.
- **1.5.1:** Require AE to be closed during installation; stage and hash-verify files, preserve a rollback copy, and refresh only the updater's cache. Keep existing CEP registry settings. Add a visible panel version for confirming the loaded build.
- **1.5.0:** Project-bin composition scanning, comp-only source swaps preserving original bin footage, and grouped sequence version folders. Multiple selected comps and duplicate-comp actions share imported footage while preserving comp scope.
- **1.4.0:** Project-bin-only imports; compatibility-filtered revision dropdowns; native still/sequence bin-only verification.
- **1.3.0:** Per-asset version/revision dropdowns with latest default and explicit older-version selection.
- **1.2.0:** Sibling render revision discovery, nested pass paths, NAS query caching and sequence warnings.
- **1.1.1:** Configurable updated-version labels.
- **1.1.0:** Checkboxes, adding layers above originals and duplicate-comp actions.
- **1.0.1:** Reliable Windows CEP responses and self-contained ExtendScript loading.
- **1.0.0:** Initial selected-footage version updater.

## Optional Adobe MCP

[After Effects MCP Extended](https://github.com/NickPittas/after-effects-mcp-extended) provides a separate chat/automation bridge. Follow that repository's installation instructions and keep its **After Effects MCP Chat** panel open when using the bridge. Version Updater runs independently of it.

The extension bundles Douglas Crockford's public-domain [json2.js](https://github.com/douglascrockford/JSON-js) for ExtendScript compatibility.
