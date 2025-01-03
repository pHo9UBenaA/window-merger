// import { GaxiosError, request } from "gaxios";

// interface AccessTokenResponse {
//   access_token: string;
//   expires_in: number;
//   refresh_token: string;
//   scope: string;
//   token_type: string;
// }

// interface UploadResponse {
//   kind: string;
//   item_id: string;
//   uploadState: string;
//   itemError?: Array<{
//     error_code: string;
//     error_detail: string;
//   }>;
// }

// interface PublishResponse {
//   kind: string;
//   item_id: string;
//   status: string[];
//   statusDetail?: Array<{
//     status: string;
//     detail: string;
//   }>;
// }

// interface ItemResponse {
//   kind: string;
//   id: string;
//   publicKey: string;
//   uploadState: string;
//   crxVersion: string;
//   itemError?: Array<{
//     error_code: string;
//     error_detail: string;
//   }>;
//   published?: {
//     status: string[];
//     statusDetail?: Array<{
//       status: string;
//       detail: string;
//     }>;
//   };
// }

// export class WebStoreError extends Error {
//   constructor(
//     message: string,
//     public readonly code: number,
//     public readonly details?: unknown
//   ) {
//     super(message);
//     this.name = "WebStoreError";
//   }
// }

// interface Config {
//   clientId: string;
//   clientSecret: string;
//   refreshToken: string;
//   extensionId: string;
// }

// let accessToken: string | null = null;

// const getAccessToken = async (config: Config): Promise<string> => {
//   if (accessToken) return accessToken;

//   try {
//     const response = await request<AccessTokenResponse>({
//       url: "https://accounts.google.com/o/oauth2/token",
//       method: "POST",
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//       },
//       data: new URLSearchParams({
//         client_id: config.clientId,
//         client_secret: config.clientSecret,
//         refresh_token: config.refreshToken,
//         grant_type: "refresh_token",
//       }).toString(),
//     });

//     accessToken = response.data.access_token;
//     return accessToken;
//   } catch (error) {
//     if (error instanceof GaxiosError) {
//       throw new WebStoreError(
//         "Failed to get access token",
//         error.response?.status || 500,
//         error.response?.data
//       );
//     }
//     throw error;
//   }
// };

// const uploadPackage = async (
//   config: Config,
//   zipFilePath: string
// ): Promise<void> => {
//   const accessToken = await getAccessToken(config);
//   const zipFile = await Bun.file(zipFilePath).arrayBuffer();

//   try {
//     const response = await request<UploadResponse>({
//       url: `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${config.extensionId}`,
//       method: "PUT",
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "x-goog-api-version": "2",
//       },
//       data: zipFile,
//     });

//     if (response.data.uploadState !== "SUCCESS") {
//       throw new WebStoreError(
//         "Failed to upload package",
//         response.status,
//         response.data
//       );
//     }
//   } catch (error) {
//     if (error instanceof GaxiosError) {
//       throw new WebStoreError(
//         "Failed to upload package",
//         error.response?.status || 500,
//         error.response?.data
//       );
//     }
//     throw error;
//   }
// };

// const publish = async (config: Config): Promise<void> => {
//   const accessToken = await getAccessToken(config);

//   try {
//     const response = await request<PublishResponse>({
//       url: `https://www.googleapis.com/chromewebstore/v1.1/items/${config.extensionId}/publish`,
//       method: "POST",
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "x-goog-api-version": "2",
//         "Content-Length": "0",
//       },
//     });

//     if (!response.data.status.includes("OK")) {
//       throw new WebStoreError(
//         "Failed to publish item",
//         response.status,
//         response.data
//       );
//     }
//   } catch (error) {
//     if (error instanceof GaxiosError) {
//       throw new WebStoreError(
//         "Failed to publish item",
//         error.response?.status || 500,
//         error.response?.data
//       );
//     }
//     throw error;
//   }
// };

// export { uploadPackage, publish };
