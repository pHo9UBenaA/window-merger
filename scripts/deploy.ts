import { getAccessToken } from './auth';
import { WebStoreError } from './errors';
import type { AccessTokenRequestBody } from './interfaces';
import { publish } from './publish';
import type { ExtensionId } from './types';
import { uploadPackage } from './upload';

const missingEnvironmentErrorMessage = 'Missing required environment variables';

const getAccessTokenRequestBody = (): AccessTokenRequestBody => {
	const { CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN } = process.env;

	if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
		throw new Error(missingEnvironmentErrorMessage);
	}

	return {
		clientId: CLIENT_ID,
		clientSecret: CLIENT_SECRET,
		refreshToken: REFRESH_TOKEN,
		grant_type: 'refresh_token',
	};
};

const getExtensionId = (): ExtensionId => {
	const { EXTENSION_ID } = process.env;

	if (!EXTENSION_ID) {
		throw new Error(missingEnvironmentErrorMessage);
	}

	return EXTENSION_ID as ExtensionId;
};

const getShouldPublish = () => {
	const args = process.argv.slice(2);
	return args.includes('--publish');
};

const deploy = async () => {
	const requestBody = getAccessTokenRequestBody();
	const accessToken = await getAccessToken(requestBody);

	const extensionId = getExtensionId();

	const shouldPublish = getShouldPublish();

	try {
		console.info('Uploading package...');
		await uploadPackage(accessToken, extensionId, './dist.zip');

		if (shouldPublish) {
			console.info('Publishing...');
			await publish(accessToken, extensionId);
		}

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
	}
};

deploy();
