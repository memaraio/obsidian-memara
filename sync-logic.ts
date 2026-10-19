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
	metadata?: Record<string, unknown>;
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

export function memoryFilePath(vaultFolder: string, memoryId: string): string {
	return `${vaultFolder}/${sanitizeFilename(memoryId)}.md`;
}

export function trashFilePath(vaultFolder: string, memoryId: string): string {
	return `${vaultFolder}/.trash/${sanitizeFilename(memoryId)}.md`;
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
		const parsed: unknown = JSON.parse(cursor);
		if (!parsed || typeof parsed !== 'object') {
			return { timestamp: cursor };
		}
		const record = parsed as { timestamp?: unknown; lastMemoryId?: unknown };
		if (typeof record.timestamp !== 'string') {
			return { timestamp: cursor };
		}
		return {
			timestamp: record.timestamp,
			...(typeof record.lastMemoryId === 'string'
				? { lastMemoryId: record.lastMemoryId }
				: {}),
		};
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

export const INITIAL_SYNC_CURSOR = '1970-01-01T00:00:00Z';
export const MAX_SYNC_PAGES = 50;
export const SYNC_PAGE_SIZE = '100';

export interface DeltaTombstone {
	memory_id: string;
	deleted_at?: string;
}

export interface DeltaSyncPage<TMemory extends { id: string }> {
	memories: TMemory[];
	tombstones: DeltaTombstone[];
	has_more: boolean;
	next_cursor: string | null;
}

export interface AppliedDeltaPage<TMemory extends { id: string }> {
	memories: TMemory[];
	tombstones: DeltaTombstone[];
	cursorToSave: string | null;
	pageNumber: number;
}

export interface DeltaSyncOutcome {
	pagesFetched: number;
	cursorsSaved: string[];
	appliedMemoryIds: string[];
	appliedTombstoneIds: string[];
	stopReason: 'complete' | 'stuck_cursor' | 'page_cap';
}

export function buildDeltaSyncQuery(options: {
	lastSyncCursor: string | null;
	spaceId?: string;
}): Record<string, string> {
	const params: Record<string, string> = {
		include_tombstones: 'true',
		size: SYNC_PAGE_SIZE,
		updated_since: options.lastSyncCursor || INITIAL_SYNC_CURSOR,
	};
	if (options.spaceId) {
		params.space_id = options.spaceId;
	}
	return params;
}

function memorySyncTimestamp(memory: { updated_at?: string; created_at?: string }): string {
	return memory.updated_at || memory.created_at || '';
}

function timestampsEqual(left: string, right: string): boolean {
	const leftMs = Date.parse(left);
	const rightMs = Date.parse(right);
	if (!Number.isNaN(leftMs) && !Number.isNaN(rightMs)) {
		return leftMs === rightMs;
	}
	return left === right;
}

function assertDeltaSyncPage<TMemory extends { id: string }>(
	page: DeltaSyncPage<TMemory>
): void {
	if (
		!page ||
		!Array.isArray(page.memories) ||
		!Array.isArray(page.tombstones) ||
		typeof page.has_more !== 'boolean'
	) {
		throw new Error('Memara sync response did not include memories and tombstones');
	}
}

export async function runDeltaSync<
	TMemory extends { id: string; updated_at?: string; created_at?: string }
>(options: {
	lastSyncCursor: string | null;
	spaceId?: string;
	maxPages?: number;
	fetchPage: (query: Record<string, string>) => Promise<DeltaSyncPage<TMemory>>;
	onPage: (applied: AppliedDeltaPage<TMemory>) => Promise<void> | void;
}): Promise<DeltaSyncOutcome> {
	const maxPages = options.maxPages ?? MAX_SYNC_PAGES;
	let requestedCursor = options.lastSyncCursor || INITIAL_SYNC_CURSOR;
	let boundaryIds = new Set<string>();
	let pagesFetched = 0;
	const cursorsSaved: string[] = [];
	const appliedMemoryIds: string[] = [];
	const appliedTombstoneIds: string[] = [];
	let stopReason: DeltaSyncOutcome['stopReason'] = 'complete';

	while (pagesFetched < maxPages) {
		const query = buildDeltaSyncQuery({
			lastSyncCursor: requestedCursor,
			spaceId: options.spaceId,
		});
		const page = await options.fetchPage(query);
		assertDeltaSyncPage(page);
		pagesFetched += 1;

		const memories = page.memories.filter((memory) => {
			const timestamp = memorySyncTimestamp(memory);
			return !(timestampsEqual(timestamp, requestedCursor) && boundaryIds.has(memory.id));
		});
		const nextCursor = page.next_cursor ?? null;
		const advanced = shouldUpdateCursor(requestedCursor, nextCursor);

		await options.onPage({
			memories,
			tombstones: page.tombstones,
			cursorToSave: advanced ? nextCursor : null,
			pageNumber: pagesFetched,
		});

		for (const memory of memories) {
			appliedMemoryIds.push(memory.id);
		}
		for (const tombstone of page.tombstones) {
			appliedTombstoneIds.push(tombstone.memory_id);
		}
		if (advanced && nextCursor) {
			cursorsSaved.push(nextCursor);
		}

		if (!page.has_more) {
			stopReason = 'complete';
			break;
		}
		if (!advanced || !nextCursor) {
			stopReason = 'stuck_cursor';
			break;
		}
		if (pagesFetched >= maxPages) {
			stopReason = 'page_cap';
			break;
		}

		boundaryIds = new Set(
			page.memories
				.filter((memory) => timestampsEqual(memorySyncTimestamp(memory), nextCursor))
				.map((memory) => memory.id)
		);
		requestedCursor = nextCursor;
	}

	return {
		pagesFetched,
		cursorsSaved,
		appliedMemoryIds,
		appliedTombstoneIds,
		stopReason,
	};
}
