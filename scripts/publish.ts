import { GaxiosError, request } from 'gaxios';
import { WebStoreError } from './errors';
import type { AccessTokenResponse, PublishResponse } from './interfaces';
import type { ExtensionId } from './types';

export const publish = async (
	accessToken: AccessTokenResponse,
	extensionId: ExtensionId
): Promise<void> => {
	try {
		const response = await request<PublishResponse>({
			url: `https://www.googleapis.com/chromewebstore/v1.1/items/${extensionId}/publish`,
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'x-goog-api-version': '2',
				'Content-Length': '0',
			},
		});

		if (!response.data.status.includes('OK')) {
			throw new WebStoreError('Failed to publish item', response.status, response.data);
		}
	} catch (error) {
		if (error instanceof GaxiosError) {
			throw new WebStoreError(
				'Failed to publish item',
				error.response?.status || 500,
				error.response?.data
			);
		}
		throw error;
	}
};
