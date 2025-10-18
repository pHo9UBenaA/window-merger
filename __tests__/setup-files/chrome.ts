import { beforeEach, vi } from 'vitest';
import { VitestChrome } from '../mocks/chrome';

beforeEach(() => {
	vi.stubGlobal('chrome', VitestChrome);
});

Object.assign(global, { chrome: VitestChrome });
