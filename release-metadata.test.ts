import { readFileSync } from 'fs';
import { join } from 'path';

function readJson(name: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(process.cwd(), name), 'utf8'));
}

describe('release metadata', () => {
	const manifest = readJson('manifest.json');
	const pkg = readJson('package.json');
	const versions = readJson('versions.json') as Record<string, string>;

	it('aligns manifest, package.json, and versions.json', () => {
		const version = manifest.version as string;
		expect(version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(pkg.version).toBe(version);
		expect(versions[version]).toBe(manifest.minAppVersion);
		expect(manifest.minAppVersion).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it('uses an id the community directory can accept', () => {
		expect(manifest.id).toBe('memara-sync');
		expect(String(manifest.id)).not.toMatch(/obsidian/i);
		expect(manifest.name).toBe('Memara Sync');
		expect(String(manifest.name)).not.toMatch(/obsidian|plugin/i);
		expect(manifest.author).toBe('Memara');
		expect(String(manifest.description).length).toBeGreaterThan(0);
		expect(manifest.isDesktopOnly).toBe(false);
	});
});
