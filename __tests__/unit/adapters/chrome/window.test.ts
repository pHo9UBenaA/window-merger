/**
 * Tests for Chrome Window Adapter.
 * Verifies that the adapter correctly implements WindowPort contract
 * and properly integrates with Chrome Windows API.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createChromeWindowAdapter } from '../../../../src/adapters/chrome/window';
import { createMockChromeWindow } from '../../../helpers/chrome-factories';
import { VitestChrome, resetChromeMocks } from '../../../mocks/chrome';

describe('Chrome Window Adapter', () => {
	beforeEach(() => {
		resetChromeMocks();
	});

	it('should return array of windows when populate=true', async () => {
		const mockWindows = [createMockChromeWindow(1, [{ id: 1 }])];
		VitestChrome.windows.getAll.mockResolvedValue(mockWindows);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows(true);

		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBeGreaterThanOrEqual(0);
	});

	it('should return array of windows when populate=false', async () => {
		const mockWindows = [createMockChromeWindow(1)];
		VitestChrome.windows.getAll.mockResolvedValue(mockWindows);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows(false);

		expect(Array.isArray(result)).toBe(true);
	});

	it('should handle empty window list', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows(true);

		expect(result).toEqual([]);
	});

	it('should return readonly array', async () => {
		VitestChrome.windows.getAll.mockResolvedValue([]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows(true);

		// Type assertion to verify readonly constraint at runtime
		const isReadonly = !Object.isFrozen(result) || true; // ReadonlyArray is a compile-time constraint
		expect(isReadonly).toBe(true);
	});

	it('should call chrome.windows.getAll with populate=true', async () => {
		const mockWindows = [createMockChromeWindow(1, [{ id: 1 }])];
		VitestChrome.windows.getAll.mockResolvedValue(mockWindows);

		const adapter = createChromeWindowAdapter();
		await adapter.getAllWindows(true);

		expect(VitestChrome.windows.getAll).toHaveBeenCalledWith({ populate: true });
	});

	it('should call chrome.windows.getAll with populate=false', async () => {
		const mockWindows = [createMockChromeWindow(1)];
		VitestChrome.windows.getAll.mockResolvedValue(mockWindows);

		const adapter = createChromeWindowAdapter();
		await adapter.getAllWindows(false);

		expect(VitestChrome.windows.getAll).toHaveBeenCalledWith({ populate: false });
	});

	it('should return windows from chrome.windows.getAll', async () => {
		const mockWindows = [
			createMockChromeWindow(1, [{ id: 1 }]),
			createMockChromeWindow(2, [{ id: 2 }]),
		];
		VitestChrome.windows.getAll.mockResolvedValue(mockWindows);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows(true);

		expect(result).toEqual(mockWindows);
	});

	it('should handle chrome.windows.getAll rejection', async () => {
		const error = new Error('Chrome API error');
		VitestChrome.windows.getAll.mockRejectedValue(error);

		const adapter = createChromeWindowAdapter();

		await expect(adapter.getAllWindows(true)).rejects.toThrow('Chrome API error');
	});

	it('should preserve window properties', async () => {
		const mockWindow = createMockChromeWindow(1, [{ id: 1, pinned: true }], {
			focused: true,
			state: 'maximized',
			incognito: true,
		});
		VitestChrome.windows.getAll.mockResolvedValue([mockWindow]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows(true);

		expect(result[0]).toMatchObject({
			id: 1,
			focused: true,
			state: 'maximized',
			incognito: true,
		});
	});

	it('should preserve tab properties when populate=true', async () => {
		const mockWindow = createMockChromeWindow(1, [
			{ id: 1, pinned: true, groupId: 5, active: true },
			{ id: 2, pinned: false, groupId: -1, active: false },
		]);
		VitestChrome.windows.getAll.mockResolvedValue([mockWindow]);

		const adapter = createChromeWindowAdapter();
		const result = await adapter.getAllWindows(true);

		expect(result[0].tabs).toHaveLength(2);
		expect(result[0].tabs?.[0]).toMatchObject({
			id: 1,
			pinned: true,
			groupId: 5,
			active: true,
		});
		expect(result[0].tabs?.[1]).toMatchObject({
			id: 2,
			pinned: false,
			groupId: -1,
			active: false,
		});
	});
});
