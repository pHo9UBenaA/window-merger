import { callOperation } from '../runtime/client.ts';

const files = callOperation<string>('git-read', { args: ['ls-files', '-z'] })
	.split('\0')
	.filter(Boolean);
if (files.length > 0) callOperation('check-tools', { tool: 'secretlint', files });
