import { prepareLockUpdate } from '../lib/chrome-compat.ts';
import { runJsonCli } from '../lib/json-cli.ts';

if (import.meta.main) await runJsonCli(prepareLockUpdate, () => undefined);
