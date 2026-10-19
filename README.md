# Memara Sync for Obsidian

Sync your Memara memories to your Obsidian vault for local access and editing.

Requires a Memara account and API key. The plugin makes network requests only to the Memara API server you configure (default `https://api.memara.io`). No telemetry.

## Features

- One-way sync from Memara to Obsidian
- First sync pulls the whole library, then later syncs send only changes
- Automatic deletion handling (moves deleted memories to .trash folder)
- YAML frontmatter with memory metadata
- Manual and automatic sync options
- Space-scoped or all-spaces sync

## Installation

### Beta via BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Open [obsidian://brat?plugin=memaraio/obsidian-memara](obsidian://brat?plugin=memaraio/obsidian-memara), or in BRAT choose "Add beta plugin" and enter `memaraio/obsidian-memara`
3. Enable "Memara Sync" in Settings > Community plugins

BRAT installs from the public repository [memaraio/obsidian-memara](https://github.com/memaraio/obsidian-memara). Releases in the private application repository are not installable.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [release](https://github.com/memaraio/obsidian-memara/releases)
2. Place the files in your vault's plugin folder:
   ```
   <vault>/.obsidian/plugins/memara-sync/
   ```
3. The folder should contain:
   - `main.js`
   - `manifest.json`
   - `styles.css`
4. Restart Obsidian or reload the app
5. Go to Settings > Community plugins and enable "Memara Sync"

### From source

In the Memara application repository, run these commands from `packages/obsidian-plugin`. In the public plugin repository, run them from the repository root.

1. Run `npm install`
2. Run `npm run build`
3. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder

## Configuration

### Getting Your API Key

1. Sign in to [Memara](https://app.memara.io)
2. Choose a space you want to sync
3. Go to **Integrations > Bare API**
4. Complete the setup wizard to generate your API key
5. Copy the key (you will not be able to see it again)

**For staging testing**: Use `https://api.staging.memara.io` as the server URL

### Plugin Settings

Open Obsidian Settings > Memara Sync:

- **Server URL**: Memara API server (default: `https://api.memara.io`, staging: `https://api.staging.memara.io`)
- **API Key**: Your Memara API key from the Bare API integration
- **Space ID**: (Optional) The `space_id` field from GET /spaces (like `space_xxxxxxxx`, not the UUID `id` field). Leave empty to sync all spaces
- **Vault folder**: Folder to store synced memories (default: `Memara`)
- **Auto-sync Interval**: Minutes between automatic syncs (0 to disable)

## Usage

### Manual Sync

Use the command palette (Ctrl/Cmd + P) and search for "Memara Sync: Sync now"

Or use the Sync button in Memara Sync settings

### Automatic Sync

Set the "Auto-sync interval" to enable periodic syncing (e.g., 30 minutes)

### File Format

Each memory is saved as a Markdown file with YAML frontmatter:

```markdown
---
memara_id: mem_abc123
space_id: space_xyz789
updated_at: 2024-01-01T12:00:00Z
tags:
  - work
  - important
importance: 8
source: api
category: personal
---

Your memory content goes here.
```

### Deleted Memories

When a memory is deleted in Memara, the plugin moves the corresponding file to a `.trash` subfolder within your vault folder. You can permanently delete these files manually.

### Sync cursor

The first sync, and any sync after Reset under Last sync, sends `updated_since=1970-01-01T00:00:00Z` with `include_tombstones=true`. Each response page is written to the vault, deletions are moved to `.trash`, and `next_cursor` is saved before the next page. A sync follows `has_more` for at most 50 pages. Run sync again to continue a library that is still larger than that. If the cursor does not move forward, the sync stops instead of requesting the same page again. Within one sync, memories already written at the cursor timestamp are skipped when the API returns them on the next page.

## Releasing

BRAT and the community plugin directory download `main.js`, `manifest.json`, and `styles.css` from a **published** GitHub release on the public repository [memaraio/obsidian-memara](https://github.com/memaraio/obsidian-memara). The release tag must be the manifest version alone (`1.1.2`), because Obsidian requests `releases/download/<version>/main.js`.

`versions.json` must stay at the root of that public repository. Obsidian uses it when a user's app is older than `minAppVersion`.

Push this tag on the application repository after `manifest.json`, `package.json`, and `versions.json` all use the same version:

```bash
git tag obsidian-plugin/v1.1.2
git push origin obsidian-plugin/v1.1.2
```

The package publish workflow then:

1. Checks the tag version against `package.json` and `manifest.json`
2. Installs, tests, and builds `main.js`
3. Copies the plugin source into `memaraio/obsidian-memara` and pushes tag `1.1.2` there

The public repository workflow `.github/workflows/release.yml` (source file `public-release.yml` in this package) builds again and attaches `main.js`, `manifest.json`, and `styles.css` to that release. The release is published, not left as a draft, so BRAT can install it.

Files copied to the public repository root:

- `main.ts`, `sync-logic.ts`, `sync-logic.test.ts`, `release-metadata.test.ts`
- `manifest.json`, `versions.json`, `styles.css`, `README.md`, `LICENSE`
- `package.json`, `package-lock.json`, `tsconfig.json`, `jest.config.js`, `esbuild.config.mjs`, `.gitignore`
- `public-release.yml` copied to `.github/workflows/release.yml`

Not copied: `node_modules`, the built `main.js` (the public workflow rebuilds it), and application-repository CI workflows.

The workflow needs the `OBSIDIAN_RELEASE_TOKEN` secret: a token that can push commits and tags to `memaraio/obsidian-memara`.

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

### Tests

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

## How It Works

The plugin uses Memara's delta sync API:

1. With no saved cursor, the plugin sends `updated_since=1970-01-01T00:00:00Z` and `include_tombstones=true`
2. With a saved cursor, that timestamp is sent as `updated_since`
3. The API returns memories and tombstones in the delta shape, including `has_more` and `next_cursor`
4. The plugin writes memories as markdown files and moves deletions to the .trash folder
5. The plugin saves `next_cursor` after each page, then requests the next page while `has_more` is true
6. The loop stops after 50 pages, or sooner if the cursor does not advance
7. The next sync continues from the saved cursor

## Troubleshooting

### Authentication Failed

- Check that your API key is correct
- Ensure the API key has not been revoked
- Verify the server URL is correct

### Network Error

- Check your internet connection
- Verify the server URL is accessible
- Check if a firewall is blocking the connection

### Sync Not Working

- Try resetting the sync cursor in settings
- Check the Obsidian developer console for errors (Ctrl/Cmd + Shift + I)
- Verify your space ID is correct (use the `space_id` field from GET /spaces, like `space_xxxxxxxx`, not the UUID `id` field)

## Privacy & Security

- API keys are stored in Obsidian's plugin data folder
- API keys are never logged or sent anywhere except to the configured Memara server
- The plugin only makes HTTPS requests to the configured server URL
- No telemetry or analytics are collected

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/memaraio/obsidian-memara/issues) page.

## License

MIT
