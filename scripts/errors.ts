export class WebStoreError extends Error {
	constructor(
		message: string,
		public readonly code: number,
		public readonly details?: unknown
	) {
		super(message);
		this.name = 'WebStoreError';
	}
}
