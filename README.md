# Memara Sync for Obsidian

Sync your Memara memories to your Obsidian vault for local access and editing.

## Features

- One-way sync from Memara to Obsidian
- Delta sync support (only syncs changes since last sync)
- Automatic deletion handling (moves deleted memories to .trash folder)
- YAML frontmatter with memory metadata
- Manual and automatic sync options
- Space-scoped or all-spaces sync

## Installation

### Beta via BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Open [obsidian://brat?plugin=memaraio/obsidian-memara](obsidian://brat?plugin=memaraio/obsidian-memara), or in BRAT choose "Add beta plugin" and enter `memaraio/obsidian-memara`
3. Enable "Memara Sync" in Settings > Community Plugins

### Manual Installation

1. Download `main.js`, `manifest.json` and `styles.css` from the latest [release](https://github.com/memaraio/obsidian-memara/releases)
2. Extract the files to your vault's plugins folder:
   ```
   <vault>/.obsidian/plugins/memara-sync/
   ```
3. The folder should contain:
   - `main.js`
   - `manifest.json`
   - `styles.css`
4. Restart Obsidian or reload the app
5. Go to Settings > Community Plugins and enable "Memara Sync"

### From Source

1. Clone this repository
2. Run `npm install`
3. Run `npm run build`
4. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder

## Configuration

### Getting Your API Key

1. Sign in to [Memara](https://app.memara.io)
2. Choose a space you want to sync
3. Go to **Integrations > Bare API**
4. Complete the setup wizard to generate your API key
5. Copy the key (you will not be able to see it again)

### Plugin Settings

Open Obsidian Settings > Memara Sync:

- **Server URL**: Memara API server (default: `https://api.memara.io`)
- **API Key**: Your Memara API key from the Bare API integration
- **Space ID**: (Optional) The `space_id` field from GET /spaces (like `space_xxxxxxxx`, not the UUID `id` field). Leave empty to sync all spaces
- **Vault Folder**: Folder to store synced memories (default: `Memara`)
- **Auto-sync Interval**: Minutes between automatic syncs (0 to disable)

## Usage

### Manual Sync

Use the command palette (Ctrl/Cmd + P) and search for "Memara: Sync now"

Or use the "Sync Now" button in settings

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

## Releasing

Bump `version` in `manifest.json` and `package.json`, add the version to `versions.json`, then push a tag that matches the version exactly (for example `1.1.1`, no `v` prefix). The release workflow builds the plugin and attaches `main.js`, `manifest.json` and `styles.css`.

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

The plugin uses Memara's delta sync API endpoint to efficiently sync only changed memories:

1. On each sync, the plugin sends the last sync timestamp as a cursor
2. The API returns only memories created or updated since that timestamp
3. The API also returns tombstones for deleted memories
4. The plugin writes new/updated memories as markdown files
5. The plugin moves deleted memories to the .trash folder
6. The cursor is saved for the next sync

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
