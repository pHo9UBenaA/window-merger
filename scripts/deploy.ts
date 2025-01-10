import { WebStoreError } from './errors';
// import { publish } from './publish';
import { uploadPackage } from './upload';

async function deploy() {
	const { CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, EXTENSION_ID } = process.env;

	if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !EXTENSION_ID) {
		console.error('Missing required environment variables');
		process.exit(1);
	}

	const config = {
		clientId: CLIENT_ID,
		clientSecret: CLIENT_SECRET,
		refreshToken: REFRESH_TOKEN,
		extensionId: EXTENSION_ID,
	};

	try {
		console.info('Uploading package...');
		await uploadPackage(config, './dist.zip');

		// console.info("Publishing...");
		// await publish(config);

		console.info('Deployment completed successfully!');
	} catch (error) {
		if (error instanceof WebStoreError) {
			console.error(`Deployment failed: ${error.message}`, {
				code: error.code,
				details: error.details,
			});
		} else {
			console.error('Unexpected error during deployment:', error);
		}
		process.exit(1);
	}
}

deploy();
