/**
 * Core sync logic extracted for testability
 */

export interface MemaraMemory {
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

export function buildFrontmatter(memory: MemaraMemory): string {
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

export function sanitizeFilename(id: string): string {
	return id.replace(/[\\/:*?"<>|]/g, '_');
}

export function buildFileContent(memory: MemaraMemory): string {
	const frontmatter = buildFrontmatter(memory);
	return `---\n${frontmatter}---\n\n${memory.content}`;
}

export interface SyncCursor {
	timestamp: string;
	lastMemoryId?: string;
}

export function parseSyncCursor(cursor: string | null): SyncCursor | null {
	if (!cursor) return null;
	
	try {
		return JSON.parse(cursor);
	} catch {
		return { timestamp: cursor };
	}
}

export function serializeSyncCursor(cursor: SyncCursor): string {
	return JSON.stringify(cursor);
}

export function shouldUpdateCursor(
	currentCursor: string | null,
	newCursor: string | null
): boolean {
	if (!newCursor) return false;
	if (!currentCursor) return true;
	
	try {
		const current = new Date(parseSyncCursor(currentCursor)?.timestamp || currentCursor);
		const next = new Date(parseSyncCursor(newCursor)?.timestamp || newCursor);
		return next > current;
	} catch {
		return true;
	}
}
