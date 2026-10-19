import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath, requestUrl } from 'obsidian';
import { DeltaSyncPage, MemaraMemory, memoryFilePath, runDeltaSync, trashFilePath } from './sync-logic';

interface MemaraSettings {
	serverUrl: string;
	apiKey: string;
	spaceId: string;
	vaultFolder: string;
	syncInterval: number;
	lastSyncCursor: string | null;
}

const DEFAULT_SETTINGS: MemaraSettings = {
	serverUrl: 'https://api.memara.io',
	apiKey: '',
	spaceId: '',
	vaultFolder: 'Memara',
	syncInterval: 0,
	lastSyncCursor: null
}

export default class MemaraSyncPlugin extends Plugin {
	settings: MemaraSettings;
	syncIntervalId: number | null = null;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'sync-now',
			name: 'Sync now',
			callback: () => {
				this.performSync();
			}
		});

		this.addSettingTab(new MemaraSyncSettingTab(this.app, this));

		if (this.settings.syncInterval > 0) {
			this.startAutoSync();
		}
	}

	onunload() {
		this.stopAutoSync();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	startAutoSync() {
		this.stopAutoSync();
		if (this.settings.syncInterval > 0) {
			this.syncIntervalId = window.setInterval(
				() => this.performSync(),
				this.settings.syncInterval * 60 * 1000
			);
		}
	}

	stopAutoSync() {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}
	}

	async performSync() {
		if (!this.settings.apiKey || !this.settings.serverUrl) {
			new Notice('Memara: Please configure API key and server URL in settings');
			return;
		}

		try {
			new Notice('Memara: Starting sync...');
			let processedCount = 0;
			let deletedCount = 0;

			const outcome = await runDeltaSync({
				lastSyncCursor: this.settings.lastSyncCursor,
				spaceId: this.settings.spaceId,
				fetchPage: (query) => this.fetchDeltaSync(query),
				onPage: async (applied) => {
					await this.ensureFolderExists(this.settings.vaultFolder);
					for (const memory of applied.memories) {
						await this.writeMemoryToFile(memory);
						processedCount++;
					}
					for (const tombstone of applied.tombstones) {
						await this.moveToTrash(tombstone.memory_id);
						deletedCount++;
					}
					if (applied.cursorToSave) {
						this.settings.lastSyncCursor = applied.cursorToSave;
						await this.saveSettings();
					}
				},
			});

			let message = `Memara: Synced ${processedCount} memories, deleted ${deletedCount}`;
			if (outcome.stopReason === 'page_cap') {
				message += '. More changes remain; sync again to continue';
			} else if (outcome.stopReason === 'stuck_cursor') {
				message += '. Sync stopped because the cursor did not advance';
			}
			new Notice(message);

		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Memara sync error: ${message}`);
			if (message.includes('401')) {
				new Notice('Memara: Authentication failed. Please check your API key.');
			} else if (message.includes('Network')) {
				new Notice('Memara: Network error. Please check your connection.');
			} else {
				new Notice(`Memara: Sync failed: ${message}`);
			}
		}
	}

	async fetchDeltaSync(query: Record<string, string>): Promise<DeltaSyncPage<MemaraMemory>> {
		const url = new URL('/memories', this.settings.serverUrl);
		url.search = new URLSearchParams(query).toString();

		const response = await requestUrl({
			url: url.toString(),
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.settings.apiKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (response.status !== 200) {
			throw new Error(`HTTP ${response.status}: ${response.text}`);
		}

		return response.json;
	}

	async ensureFolderExists(folderPath: string) {
		const normalized = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalized);
		if (!folder) {
			await this.app.vault.createFolder(normalized);
		}
	}

	async writeMemoryToFile(memory: MemaraMemory) {
		const filepath = normalizePath(memoryFilePath(this.settings.vaultFolder, memory.id));
		
		const frontmatter = this.buildFrontmatter(memory);
		const content = `---\n${frontmatter}---\n\n${memory.content}`;

		const existingFile = this.app.vault.getAbstractFileByPath(filepath);
		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, content);
		} else if (!existingFile) {
			await this.app.vault.create(filepath, content);
		}
	}

	buildFrontmatter(memory: MemaraMemory): string {
		const parts: string[] = [];
		parts.push(`memara_id: ${memory.id}`);
		parts.push(`space_id: ${memory.space_id}`);
		parts.push(`updated_at: ${memory.updated_at}`);
		
		if (memory.tags && memory.tags.length > 0) {
			parts.push(`tags:`);
			memory.tags.forEach(tag => {
				parts.push(`  - ${tag}`);
			});
		}

		if (memory.importance) {
			parts.push(`importance: ${memory.importance}`);
		}

		if (memory.source) {
			parts.push(`source: ${memory.source}`);
		}

		if (memory.category) {
			parts.push(`category: ${memory.category}`);
		}

		return parts.join('\n') + '\n';
	}

	async moveToTrash(memoryId: string) {
		const filepath = normalizePath(memoryFilePath(this.settings.vaultFolder, memoryId));
		const file = this.app.vault.getAbstractFileByPath(filepath);
		
		if (file instanceof TFile) {
			const trashFolder = normalizePath(`${this.settings.vaultFolder}/.trash`);
			await this.ensureFolderExists(trashFolder);
			await this.app.vault.rename(file, normalizePath(trashFilePath(this.settings.vaultFolder, memoryId)));
		}
	}
}

class MemaraSyncSettingTab extends PluginSettingTab {
	plugin: MemaraSyncPlugin;

	constructor(app: App, plugin: MemaraSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Server URL')
			.setDesc('Memara API server URL (use https://api.staging.memara.io for staging)')
			.addText(text => text
				.setPlaceholder('https://api.memara.io')
				.setValue(this.plugin.settings.serverUrl)
				.onChange(async (value) => {
					this.plugin.settings.serverUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API key')
			.setDesc('Your Memara API key (stored securely)')
			.addText(text => {
				text.setPlaceholder('Enter your API key')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'password';
			});

		new Setting(containerEl)
			.setName('Space ID')
			.setDesc('Target space_id from GET /spaces (like space_xxxxxxxx, not the UUID id field). Leave empty for all spaces.')
			.addText(text => text
				.setPlaceholder('space_xxxxxxxx')
				.setValue(this.plugin.settings.spaceId)
				.onChange(async (value) => {
					this.plugin.settings.spaceId = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Vault folder')
			.setDesc('Folder in your vault to sync memories to')
			.addText(text => text
				.setPlaceholder('Memara')
				.setValue(this.plugin.settings.vaultFolder)
				.onChange(async (value) => {
					this.plugin.settings.vaultFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-sync interval')
			.setDesc('Automatic sync interval in minutes (0 to disable)')
			.addText(text => text
				.setPlaceholder('0')
				.setValue(String(this.plugin.settings.syncInterval))
				.onChange(async (value) => {
					const interval = parseInt(value) || 0;
					this.plugin.settings.syncInterval = interval;
					await this.plugin.saveSettings();
					this.plugin.startAutoSync();
				}));

		new Setting(containerEl)
			.setName('Sync now')
			.setDesc('Manually trigger a sync')
			.addButton(button => button
				.setButtonText('Sync')
				.onClick(() => {
					this.plugin.performSync();
				}));

		if (this.plugin.settings.lastSyncCursor) {
			new Setting(containerEl)
				.setName('Last sync')
				.setDesc(`Last synced at: ${this.plugin.settings.lastSyncCursor}`)
				.addButton(button => button
					.setButtonText('Reset')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.lastSyncCursor = null;
						await this.plugin.saveSettings();
						this.display();
					}));
		}
	}
}
