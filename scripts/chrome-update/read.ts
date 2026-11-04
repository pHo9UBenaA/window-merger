import { prepareLockUpdate } from '../lib/chrome-compat.ts';
import { runJsonCli } from '../lib/json-cli.ts';

export { prepareLockUpdate } from '../lib/chrome-compat.ts';

if (import.meta.main) await runJsonCli(prepareLockUpdate);
