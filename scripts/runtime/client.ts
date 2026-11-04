import { readSync, writeSync } from 'node:fs';

export const callOperation = <T>(operation: string, input: unknown = {}): T => {
	const request = Buffer.from(`${JSON.stringify({ operation, input })}\n`);
	for (let offset = 0; offset < request.length; ) offset += writeSync(3, request, offset);
	const chunks: Buffer[] = [];
	for (;;) {
		const chunk = Buffer.alloc(64 * 1024);
		const length = readSync(4, chunk);
		if (length === 0) throw new Error('Operation runner disconnected');
		chunks.push(chunk.subarray(0, length));
		if (chunk[length - 1] === 10) break;
	}
	const response = JSON.parse(Buffer.concat(chunks).toString('utf8'));
	if (response.error) throw Object.assign(new Error(response.error.message), response.error);
	return response.value;
};
