import { GaxiosError, request } from 'gaxios';
import { getAccessToken } from './auth';
import { WebStoreError } from './errors';
import type { Config, UploadResponse } from './types';

export const uploadPackage = async (config: Config, zipFilePath: string): Promise<void> => {
	const accessToken = await getAccessToken(config);
	const zipFile = await Bun.file(zipFilePath).arrayBuffer();

	try {
		const response = await request<UploadResponse>({
			url: `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${config.extensionId}`,
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'x-goog-api-version': '2',
			},
			body: zipFile,
		});

		console.log(response);

		if (response.data.uploadState !== 'SUCCESS') {
			throw new WebStoreError('Failed to upload package', response.status, response.data);
		}
	} catch (error) {
		if (error instanceof GaxiosError) {
			throw new WebStoreError(
				'Failed to upload package',
				error.response?.status || 500,
				error.response?.data
			);
		}
		throw error;
	}
};
