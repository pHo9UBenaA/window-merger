import { GaxiosError, request } from 'gaxios';
import { WebStoreError } from './errors';
import type { AccessTokenResponse, Config } from './types';

let accessToken: string | null = null;

export const getAccessToken = async (config: Config): Promise<string> => {
	if (accessToken) return accessToken;

	try {
		const response = await request<AccessTokenResponse>({
			url: 'https://accounts.google.com/o/oauth2/token',
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			data: new URLSearchParams({
				client_id: config.clientId,
				client_secret: config.clientSecret,
				refresh_token: config.refreshToken,
				grant_type: 'refresh_token',
			}).toString(),
		});

		accessToken = response.data.access_token;
		return accessToken;
	} catch (error) {
		if (error instanceof GaxiosError) {
			throw new WebStoreError(
				'Failed to get access token',
				error.response?.status || 500,
				error.response?.data
			);
		}
		throw error;
	}
};
