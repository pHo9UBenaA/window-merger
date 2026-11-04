import { readChromeMatrix } from '../lib/chrome-compat.ts';

console.log(JSON.stringify(await readChromeMatrix()));
