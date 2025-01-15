export interface AccessTokenRequestBody {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	grant_type: 'refresh_token';
}

export interface AccessTokenResponse {
	access_token: string;
	expires_in: number;
	refresh_token: string;
	scope: string;
	token_type: string;
}

export interface UploadResponse {
	kind: string;
	item_id: string;
	uploadState: string;
	itemError?: Array<{
		error_code: string;
		error_detail: string;
	}>;
}

export interface PublishResponse {
	kind: string;
	item_id: string;
	status: string[];
	statusDetail?: Array<{
		status: string;
		detail: string;
	}>;
}

export interface ItemResponse {
	kind: string;
	id: string;
	publicKey: string;
	uploadState: string;
	crxVersion: string;
	itemError?: Array<{
		error_code: string;
		error_detail: string;
	}>;
	published?: {
		status: string[];
		statusDetail?: Array<{
			status: string;
			detail: string;
		}>;
	};
}
