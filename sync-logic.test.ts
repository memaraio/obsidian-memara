import {
	buildFrontmatter,
	buildFileContent,
	sanitizeFilename,
	memoryFilePath,
	trashFilePath,
	parseSyncCursor,
	serializeSyncCursor,
	shouldUpdateCursor,
	MemaraMemory,
	runDeltaSync,
	MAX_SYNC_PAGES,
	DeltaSyncPage
} from './sync-logic';

describe('buildFrontmatter', () => {
	it('should build basic frontmatter', () => {
		const memory: MemaraMemory = {
			id: 'mem_123',
			content: 'Test content',
			tags: [],
			space_id: 'space_abc',
			updated_at: '2024-01-01T00:00:00Z',
			created_at: '2024-01-01T00:00:00Z'
		};

		const frontmatter = buildFrontmatter(memory);
		expect(frontmatter).toContain('memara_id: mem_123');
		expect(frontmatter).toContain('space_id: space_abc');
		expect(frontmatter).toContain('updated_at: 2024-01-01T00:00:00Z');
	});

	it('should include tags when present', () => {
		const memory: MemaraMemory = {
			id: 'mem_123',
			content: 'Test content',
			tags: ['work', 'important'],
			space_id: 'space_abc',
			updated_at: '2024-01-01T00:00:00Z',
			created_at: '2024-01-01T00:00:00Z'
		};

		const frontmatter = buildFrontmatter(memory);
		expect(frontmatter).toContain('tags:');
		expect(frontmatter).toContain('  - work');
		expect(frontmatter).toContain('  - important');
	});

	it('should include optional fields when present', () => {
		const memory: MemaraMemory = {
			id: 'mem_123',
			content: 'Test content',
			tags: [],
			space_id: 'space_abc',
			updated_at: '2024-01-01T00:00:00Z',
			created_at: '2024-01-01T00:00:00Z',
			importance: 8,
			source: 'api',
			category: 'personal'
		};

		const frontmatter = buildFrontmatter(memory);
		expect(frontmatter).toContain('importance: 8');
		expect(frontmatter).toContain('source: api');
		expect(frontmatter).toContain('category: personal');
	});
});

describe('sanitizeFilename', () => {
	it('should replace invalid characters', () => {
		expect(sanitizeFilename('file:name')).toBe('file_name');
		expect(sanitizeFilename('file/name')).toBe('file_name');
		expect(sanitizeFilename('file\\name')).toBe('file_name');
		expect(sanitizeFilename('file*name')).toBe('file_name');
		expect(sanitizeFilename('file?name')).toBe('file_name');
		expect(sanitizeFilename('file"name')).toBe('file_name');
		expect(sanitizeFilename('file<name>')).toBe('file_name_');
		expect(sanitizeFilename('file|name')).toBe('file_name');
	});

	it('should handle valid filenames', () => {
		expect(sanitizeFilename('valid_filename')).toBe('valid_filename');
		expect(sanitizeFilename('mem_123')).toBe('mem_123');
	});
});

describe('vault paths', () => {
	it('should build memory and trash paths from the vault folder', () => {
		expect(memoryFilePath('Memara', 'mem_123')).toBe('Memara/mem_123.md');
		expect(trashFilePath('Memara', 'mem:123')).toBe('Memara/.trash/mem_123.md');
	});
});

describe('buildFileContent', () => {
	it('should combine frontmatter and content', () => {
		const memory: MemaraMemory = {
			id: 'mem_123',
			content: 'This is my memory content',
			tags: ['test'],
			space_id: 'space_abc',
			updated_at: '2024-01-01T00:00:00Z',
			created_at: '2024-01-01T00:00:00Z'
		};

		const fileContent = buildFileContent(memory);
		expect(fileContent).toContain('---');
		expect(fileContent).toContain('memara_id: mem_123');
		expect(fileContent).toContain('This is my memory content');
		expect(fileContent.split('---').length).toBe(3);
	});
});

describe('cursor management', () => {
	it('should parse simple timestamp cursor', () => {
		const cursor = parseSyncCursor('2024-01-01T00:00:00Z');
		expect(cursor).toEqual({ timestamp: '2024-01-01T00:00:00Z' });
	});

	it('should parse JSON cursor', () => {
		const jsonCursor = JSON.stringify({
			timestamp: '2024-01-01T00:00:00Z',
			lastMemoryId: 'mem_123'
		});
		const cursor = parseSyncCursor(jsonCursor);
		expect(cursor).toEqual({
			timestamp: '2024-01-01T00:00:00Z',
			lastMemoryId: 'mem_123'
		});
	});

	it('should handle null cursor', () => {
		expect(parseSyncCursor(null)).toBeNull();
	});

	it('should serialize cursor', () => {
		const cursor = {
			timestamp: '2024-01-01T00:00:00Z',
			lastMemoryId: 'mem_123'
		};
		const serialized = serializeSyncCursor(cursor);
		expect(JSON.parse(serialized)).toEqual(cursor);
	});

	it('should determine if cursor should be updated', () => {
		const oldCursor = '2024-01-01T00:00:00Z';
		const newCursor = '2024-01-02T00:00:00Z';
		
		expect(shouldUpdateCursor(null, newCursor)).toBe(true);
		expect(shouldUpdateCursor(oldCursor, newCursor)).toBe(true);
		expect(shouldUpdateCursor(newCursor, oldCursor)).toBe(false);
		expect(shouldUpdateCursor(oldCursor, null)).toBe(false);
	});
});

function sampleMemory(id: string, updatedAt: string): MemaraMemory {
	return {
		id,
		content: `content ${id}`,
		tags: [],
		space_id: 'space_abc',
		updated_at: updatedAt,
		created_at: updatedAt,
	};
}

function samplePage(
	memories: MemaraMemory[],
	options: { hasMore: boolean; nextCursor: string | null; tombstoneId?: string }
): DeltaSyncPage<MemaraMemory> {
	return {
		memories,
		tombstones: options.tombstoneId ? [{ memory_id: options.tombstoneId }] : [],
		has_more: options.hasMore,
		next_cursor: options.nextCursor,
	};
}

describe('delta sync paging', () => {
	it('requests the epoch cursor on the first sync', async () => {
		const queries: Record<string, string>[] = [];
		const outcome = await runDeltaSync({
			lastSyncCursor: null,
			spaceId: 'space_abc',
			fetchPage: async (query) => {
				queries.push(query);
				return samplePage([sampleMemory('mem_1', '2024-02-01T00:00:00Z')], {
					hasMore: false,
					nextCursor: '2024-02-01T00:00:00Z',
					tombstoneId: 'gone_1',
				});
			},
			onPage: () => undefined,
		});

		expect(queries).toHaveLength(1);
		expect(queries[0].updated_since).toBe('1970-01-01T00:00:00Z');
		expect(queries[0].include_tombstones).toBe('true');
		expect(queries[0].space_id).toBe('space_abc');
		expect(outcome.stopReason).toBe('complete');
		expect(outcome.appliedMemoryIds).toEqual(['mem_1']);
		expect(outcome.appliedTombstoneIds).toEqual(['gone_1']);
		expect(outcome.cursorsSaved).toEqual(['2024-02-01T00:00:00Z']);
	});

	it('follows has_more and saves the cursor after each page', async () => {
		const events: string[] = [];
		const pages = [
			samplePage(
				[
					sampleMemory('mem_1', '2024-03-01T00:00:00Z'),
					sampleMemory('mem_2', '2024-03-02T00:00:00Z'),
				],
				{ hasMore: true, nextCursor: '2024-03-02T00:00:00Z', tombstoneId: 'gone_1' }
			),
			samplePage(
				[
					sampleMemory('mem_2', '2024-03-02T00:00:00Z'),
					sampleMemory('mem_3', '2024-03-03T00:00:00Z'),
				],
				{ hasMore: false, nextCursor: '2024-03-03T00:00:00Z' }
			),
		];

		const outcome = await runDeltaSync({
			lastSyncCursor: null,
			fetchPage: async (query) => {
				events.push(`fetch:${query.updated_since}`);
				const page = pages.shift();
				if (!page) {
					throw new Error('unexpected extra page');
				}
				return page;
			},
			onPage: async (applied) => {
				events.push(`save:${applied.cursorToSave}`);
				events.push(`ids:${applied.memories.map((memory) => memory.id).join(',')}`);
			},
		});

		expect(events).toEqual([
			'fetch:1970-01-01T00:00:00Z',
			'save:2024-03-02T00:00:00Z',
			'ids:mem_1,mem_2',
			'fetch:2024-03-02T00:00:00Z',
			'save:2024-03-03T00:00:00Z',
			'ids:mem_3',
		]);
		expect(outcome.pagesFetched).toBe(2);
		expect(outcome.stopReason).toBe('complete');
		expect(outcome.appliedMemoryIds).toEqual(['mem_1', 'mem_2', 'mem_3']);
		expect(outcome.appliedTombstoneIds).toEqual(['gone_1']);
		expect(outcome.cursorsSaved).toEqual([
			'2024-03-02T00:00:00Z',
			'2024-03-03T00:00:00Z',
		]);
	});

	it('stops after 50 pages while more results remain', async () => {
		expect(MAX_SYNC_PAGES).toBe(50);
		let pageNumber = 0;
		const outcome = await runDeltaSync({
			lastSyncCursor: null,
			fetchPage: async () => {
				pageNumber += 1;
				const stamp = new Date(Date.UTC(2024, 0, pageNumber)).toISOString();
				return samplePage([sampleMemory(`mem_${pageNumber}`, stamp)], {
					hasMore: true,
					nextCursor: stamp,
				});
			},
			onPage: () => undefined,
		});

		expect(outcome.pagesFetched).toBe(50);
		expect(outcome.stopReason).toBe('page_cap');
		expect(outcome.appliedMemoryIds).toHaveLength(50);
		expect(outcome.cursorsSaved).toHaveLength(50);
	});

	it('stops when the cursor does not advance', async () => {
		const queries: string[] = [];
		const tie = '2024-04-01T00:00:00Z';
		const pages = [
			samplePage([sampleMemory('mem_a', tie)], {
				hasMore: true,
				nextCursor: tie,
			}),
			samplePage(
				[sampleMemory('mem_a', tie), sampleMemory('mem_b', tie)],
				{ hasMore: true, nextCursor: tie, tombstoneId: 'gone_b' }
			),
		];

		const outcome = await runDeltaSync({
			lastSyncCursor: null,
			fetchPage: async (query) => {
				queries.push(query.updated_since);
				const page = pages.shift();
				if (!page) {
					throw new Error('unexpected extra page');
				}
				return page;
			},
			onPage: () => undefined,
		});

		expect(queries).toEqual(['1970-01-01T00:00:00Z', tie]);
		expect(outcome.pagesFetched).toBe(2);
		expect(outcome.stopReason).toBe('stuck_cursor');
		expect(outcome.appliedMemoryIds).toEqual(['mem_a', 'mem_b']);
		expect(outcome.appliedTombstoneIds).toEqual(['gone_b']);
		expect(outcome.cursorsSaved).toEqual([tie]);
	});

	it('rejects a list response that has no delta fields', async () => {
		await expect(
			runDeltaSync({
				lastSyncCursor: null,
				fetchPage: async () => ({ items: [] } as unknown as DeltaSyncPage<MemaraMemory>),
				onPage: () => undefined,
			})
		).rejects.toThrow('did not include memories and tombstones');
	});
});
