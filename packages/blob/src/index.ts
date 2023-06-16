import type { Readable } from 'node:stream';
import type { BodyInit } from 'undici';
// When bundled via a bundler supporting the `browser` field, then
// the `undici` module will be replaced with https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
// for browser contexts. See ./undici-browser.js and ./package.json
import { fetch } from 'undici';
import {
  BlobAccessError,
  BlobError,
  BlobUnknownError,
  getToken,
} from './helpers';
import { EventTypes, type GenerateClientTokenEvent } from './client-upload';

export { BlobAccessError, BlobError, BlobUnknownError };
export {
  generateClientTokenFromReadWriteToken,
  getPayloadFromClientToken,
  verifyCallbackSignature,
  handleBlobUpload,
  type BlobUploadCompletedEvent,
  type GenerateClientTokenOptions,
  type HandleBlobUploadBody,
  type HandleBlobUploadOptions,
} from './client-upload';

export interface BlobResult {
  url: string;
  size: string;
  uploadedAt: Date;
  pathname: string;
  contentType: string;
  contentDisposition: string;
}

export interface ListBlobResult {
  blobs: BlobResult[];
  cursor?: string;
  hasMore: boolean;
}

export interface ListCommandOptions extends BlobCommandOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
}

export interface BlobCommandOptions {
  token?: string;
}

export interface PutCommandOptions extends BlobCommandOptions {
  access: 'public';
  contentType?: string;
  handleBlobUploadUrl?: string;
}

export async function put(
  pathname: string,
  body:
    | string
    | Readable
    | Blob
    | ArrayBuffer
    | FormData
    | ReadableStream
    | File,
  options: PutCommandOptions,
): Promise<BlobResult> {
  if (!pathname) {
    throw new BlobError('pathname is required');
  }

  if (!body) {
    throw new BlobError('body is required');
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!options || options.access !== 'public') {
    throw new BlobError('access must be "public"');
  }

  await checkAndRetrieveClientToken(pathname, options);

  const headers: Record<string, string> = {
    authorization: `Bearer ${getToken(options)}`,
  };

  if (options.contentType) {
    headers['x-content-type'] = options.contentType;
  }

  const blobApiResponse = await fetch(`${getApiUrl()}/${pathname}`, {
    method: 'PUT',
    body: body as BodyInit,
    headers,
    // required in order to stream some body types to Cloudflare
    // currently only supported in Node.js, we may have to feature detect this
    duplex: 'half',
  });

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

  const blobResult = (await blobApiResponse.json()) as BlobMetadataApi;
  return mapBlobResult(blobResult);
}

type BlobDelResult<T extends string | string[]> = T extends string
  ? BlobResult | null
  : (BlobResult | null)[];

export async function del<T extends string | string[]>(
  url: T,
  options?: BlobCommandOptions,
): Promise<BlobDelResult<T>> {
  const blobApiResponse = await fetch(`${getApiUrl()}/delete`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${getToken(options)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ urls: Array.isArray(url) ? url : [url] }),
  });

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

  const delResult =
    (await blobApiResponse.json()) as (BlobMetadataApi | null)[];

  if (Array.isArray(url)) {
    return delResult.map((deletedBlob) =>
      deletedBlob ? mapBlobResult(deletedBlob) : null,
    ) as BlobDelResult<T>;
  }
  if (delResult[0]) {
    return mapBlobResult(delResult[0]) as BlobDelResult<T>;
  }
  return null as BlobDelResult<T>;
}

interface BlobMetadataApi extends Omit<BlobResult, 'uploadedAt'> {
  uploadedAt: string;
}
interface ListBlobResultApi extends Omit<ListBlobResult, 'blobs'> {
  blobs: BlobMetadataApi[];
}

export async function head(
  url: string,
  options?: BlobCommandOptions,
): Promise<BlobResult | null> {
  const headApiUrl = new URL(getApiUrl());
  headApiUrl.searchParams.set('url', url);

  const blobApiResponse = await fetch(headApiUrl, {
    method: 'GET', // HEAD can't have body as a response, so we use GET
    headers: {
      authorization: `Bearer ${getToken(options)}`,
    },
  });

  if (blobApiResponse.status === 404) {
    return null;
  }

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

  const headResult = (await blobApiResponse.json()) as BlobMetadataApi;

  return mapBlobResult(headResult);
}

export async function list(
  options?: ListCommandOptions,
): Promise<ListBlobResult> {
  const listApiUrl = new URL(getApiUrl());
  if (options?.limit) {
    listApiUrl.searchParams.set('limit', options.limit.toString());
  }
  if (options?.prefix) {
    listApiUrl.searchParams.set('prefix', options.prefix);
  }
  if (options?.cursor) {
    listApiUrl.searchParams.set('cursor', options.cursor);
  }
  const blobApiResponse = await fetch(listApiUrl, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${getToken(options)}`,
    },
  });

  if (blobApiResponse.status !== 200) {
    if (blobApiResponse.status === 403) {
      throw new BlobAccessError();
    } else {
      throw new BlobUnknownError();
    }
  }

  const results = (await blobApiResponse.json()) as ListBlobResultApi;

  return {
    ...results,
    blobs: results.blobs.map(mapBlobResult),
  };
}

function getApiUrl(): string {
  return (
    process.env.VERCEL_BLOB_API_URL ||
    process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL ||
    'https://blob.vercel-storage.com'
  );
}

function mapBlobResult(blobResult: BlobMetadataApi): BlobResult {
  return {
    ...blobResult,
    uploadedAt: new Date(blobResult.uploadedAt),
  };
}

function isValidUrl(url: string): boolean {
  try {
    return Boolean(new URL(url));
  } catch (e) {
    return false;
  }
}

async function checkAndRetrieveClientToken(
  pathname: string,
  options: PutCommandOptions,
): Promise<void> {
  if (!options.token && options.handleBlobUploadUrl) {
    const { handleBlobUploadUrl } = options;
    const url = isValidUrl(handleBlobUploadUrl)
      ? handleBlobUploadUrl
      : `${window.location.origin}${handleBlobUploadUrl}`;

    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        type: EventTypes.generateClientToken,
        payload: { pathname, callbackUrl: url },
      } as GenerateClientTokenEvent),
    });
    if (!res.ok) {
      throw new BlobError('Failed to  retrieve the client token');
    }
    try {
      const { clientToken } = (await res.json()) as { clientToken: string };
      options.token = clientToken;
    } catch (e) {
      throw new BlobError('Failed to retrieve the client token');
    }
  }
}
