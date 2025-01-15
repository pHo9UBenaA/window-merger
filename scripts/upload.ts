import { GaxiosError, request } from 'gaxios';
import { WebStoreError } from './errors';
import type { AccessTokenResponse, UploadResponse } from './interfaces';
import type { ExtensionId } from './types';

export const uploadPackage = async (
	accessToken: AccessTokenResponse,
	extensionId: ExtensionId,
	zipFilePath: string
): Promise<void> => {
	const zipFile = await Bun.file(zipFilePath).arrayBuffer();

	try {
		const response = await request<UploadResponse>({
			url: `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${extensionId}`,
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${accessToken.access_token}`,
				'x-goog-api-version': '2',
			},
			body: zipFile,
		});

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
