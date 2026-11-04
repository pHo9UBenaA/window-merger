import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import {
	CODE_ROOT,
	codePermissions,
	operationPolicies,
	taskPermissions,
	taskPolicies,
} from './runtime/policy.ts';
import { createOperationScope } from './runtime/scope.ts';
import { errorDetails, object, text } from './runtime/validation.ts';

const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const environment = () => {
	const { NODE_OPTIONS: _options, ...env } = process.env;
	return env;
};

const executeOperation = (
	file: string,
	flags: readonly string[],
	input: unknown,
	root: string
): Promise<string> =>
	new Promise((fulfill, reject) => {
		const operation = spawn(
			process.execPath,
			[
				...codePermissions,
				...flags,
				join(CODE_ROOT, 'scripts/runtime/operation.ts'),
				join(CODE_ROOT, 'scripts/operations', `${file}.ts`),
			],
			{ cwd: root, env: environment(), stdio: ['pipe', 'pipe', 'inherit'] }
		);
		const chunks: Buffer[] = [];
		let bytes = 0;
		operation.stdout.on('data', (chunk: Buffer) => {
			bytes += chunk.length;
			if (bytes > MAX_MESSAGE_BYTES) {
				operation.kill();
				reject(new Error('Operation response exceeds 16 MiB'));
			} else chunks.push(chunk);
		});
		operation.on('error', reject);
		operation.stdin.on('error', reject);
		operation.on('close', (status) => {
			if (status !== 0) reject(new Error(`Operation ${file} failed (${status})`));
			else fulfill(Buffer.concat(chunks).toString('utf8').trim());
		});
		operation.stdin.end(JSON.stringify(input));
	});

const run = async (): Promise<void> => {
	const args = process.argv.slice(2);
	const root = args[0] === '--root' ? resolve(args[1]) : process.cwd();
	const [name, ...taskArgs] = args[0] === '--root' ? args.slice(2) : args;
	const policies = taskPolicies(root);
	if (!Object.hasOwn(policies, name)) throw new Error(`Unknown task: ${name}`);
	const policy = policies[name];
	const operations = operationPolicies(root);
	const scope = createOperationScope(root, name);
	const task = spawn(
		process.execPath,
		[
			...taskPermissions(root, policy),
			join(CODE_ROOT, 'scripts/tasks', `${name}.ts`),
			...taskArgs,
		],
		{ cwd: root, env: environment(), stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'pipe'] }
	);
	const interrupt = () => {
		task.kill('SIGINT');
	};
	const terminate = () => {
		task.kill('SIGTERM');
	};
	process.on('SIGINT', interrupt);
	process.on('SIGTERM', terminate);
	const requests = task.stdio[3];
	const responses = task.stdio[4];
	if (!requests || !('readable' in requests) || !responses || !('write' in responses))
		throw new Error('Missing operation channels');
	const completion = new Promise<void>((fulfill, reject) => {
		task.on('error', reject);
		task.on('exit', (status, signal) => {
			process.exitCode = status ?? (signal ? 128 + (constants.signals[signal] ?? 0) : 1);
			fulfill();
		});
	});
	try {
		for await (const line of createInterface({ input: requests })) {
			try {
				if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES)
					throw new Error('Operation request exceeds 16 MiB');
				const request = object(JSON.parse(line));
				const operationName = text(request.operation);
				if (!policy.operations.includes(operationName))
					throw new Error(`Operation not permitted: ${operationName}`);
				scope.check(operationName, request.input);
				const operation = operations[operationName];
				const response = await executeOperation(
					operation.file,
					operation.flags,
					request.input,
					root
				);
				const result = object(JSON.parse(response));
				if (!result.error) scope.record(operationName, request.input, result.value);
				responses.write(`${response}\n`);
			} catch (error) {
				responses.write(`${JSON.stringify({ error: errorDetails(error) })}\n`);
			}
		}
		await completion;
	} finally {
		process.off('SIGINT', interrupt);
		process.off('SIGTERM', terminate);
		if (task.exitCode === null) task.kill();
	}
};

try {
	await run();
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
