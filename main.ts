import { App, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';

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

interface MemaraMemory {
	id: string;
	content: string;
	tags: string[];
	space_id: string;
	updated_at: string;
	created_at: string;
	importance?: number;
	source?: string;
	category?: string;
	metadata?: Record<string, any>;
}

interface MemoryTombstone {
	memory_id: string;
	deleted_at: string;
}

interface DeltaSyncResponse {
	memories: MemaraMemory[];
	tombstones: MemoryTombstone[];
	total_memories: number;
	total_tombstones: number;
	has_more: boolean;
	next_cursor: string | null;
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
			
			const response = await this.fetchDeltaSync();
			
			await this.ensureFolderExists(this.settings.vaultFolder);
			
			let processedCount = 0;
			for (const memory of response.memories) {
				await this.writeMemoryToFile(memory);
				processedCount++;
			}

			let deletedCount = 0;
			for (const tombstone of response.tombstones) {
				await this.moveToTrash(tombstone.memory_id);
				deletedCount++;
			}

			if (response.next_cursor) {
				this.settings.lastSyncCursor = response.next_cursor;
				await this.saveSettings();
			}

			const message = `Memara: Synced ${processedCount} memories, deleted ${deletedCount}`;
			new Notice(message);

		} catch (error) {
			console.error('Memara sync error:', error);
			if (error.message?.includes('401')) {
				new Notice('Memara: Authentication failed. Please check your API key.');
			} else if (error.message?.includes('Network')) {
				new Notice('Memara: Network error. Please check your connection.');
			} else {
				new Notice(`Memara: Sync failed: ${error.message}`);
			}
		}
	}

	async fetchDeltaSync(): Promise<DeltaSyncResponse> {
		const url = new URL('/memories', this.settings.serverUrl);
		
		const params: Record<string, string> = {
			include_tombstones: 'true',
			size: '100'
		};

		if (this.settings.spaceId) {
			params.space_id = this.settings.spaceId;
		}

		if (this.settings.lastSyncCursor) {
			params.updated_since = this.settings.lastSyncCursor;
		}

		url.search = new URLSearchParams(params).toString();

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
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	async writeMemoryToFile(memory: MemaraMemory) {
		const filename = this.sanitizeFilename(memory.id);
		const filepath = `${this.settings.vaultFolder}/${filename}.md`;
		
		const frontmatter = this.buildFrontmatter(memory);
		const content = `---\n${frontmatter}---\n\n${memory.content}`;

		const existingFile = this.app.vault.getAbstractFileByPath(filepath);
		if (existingFile) {
			await this.app.vault.modify(existingFile as any, content);
		} else {
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

	sanitizeFilename(id: string): string {
		return id.replace(/[\\/:*?"<>|]/g, '_');
	}

	async moveToTrash(memoryId: string) {
		const filename = this.sanitizeFilename(memoryId);
		const filepath = `${this.settings.vaultFolder}/${filename}.md`;
		const file = this.app.vault.getAbstractFileByPath(filepath);
		
		if (file) {
			const trashFolder = `${this.settings.vaultFolder}/.trash`;
			await this.ensureFolderExists(trashFolder);
			
			const trashPath = `${trashFolder}/${filename}.md`;
			await this.app.vault.rename(file, trashPath);
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
			.setDesc('Memara API server URL')
			.addText(text => text
				.setPlaceholder('https://api.memara.io')
				.setValue(this.plugin.settings.serverUrl)
				.onChange(async (value) => {
					this.plugin.settings.serverUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API Key')
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
			.setName('Vault Folder')
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
			.setName('Sync Now')
			.setDesc('Manually trigger a sync')
			.addButton(button => button
				.setButtonText('Sync')
				.onClick(() => {
					this.plugin.performSync();
				}));

		if (this.plugin.settings.lastSyncCursor) {
			new Setting(containerEl)
				.setName('Last Sync')
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
