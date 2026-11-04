import { checkToolsCommand, gitReadCommand } from '../lib/commands.generated.ts';
import { runNode } from '../lib/run-node.ts';

const files = runNode<string>(gitReadCommand(), { args: ['ls-files', '-z'] })
	.split('\0')
	.filter(Boolean);
if (files.length > 0) runNode(checkToolsCommand(), { tool: 'secretlint', files });
