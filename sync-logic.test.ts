import {
	buildFrontmatter,
	buildFileContent,
	sanitizeFilename,
	parseSyncCursor,
	serializeSyncCursor,
	shouldUpdateCursor,
	MemaraMemory
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
