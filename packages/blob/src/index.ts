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

// This version is used to ensure that the client and server are compatible
// The server (Vercel Blob API) uses this information to change its behavior like the
// response format
const BLOB_API_VERSION = 2;

export interface BlobCommandOptions {
  token?: string;
}

// vercelBlob.put()
export interface PutCommandOptions extends BlobCommandOptions {
  access: 'public';
  contentType?: string;
  handleBlobUploadUrl?: string;
}

export interface PutBlobResult {
  url: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
}

type PutBlobApiResponse = PutBlobResult;

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
): Promise<PutBlobResult> {
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

  const token = shouldFetchClientToken(options)
    ? await retrieveClientToken({
        handleBlobUploadUrl: options.handleBlobUploadUrl,
        pathname,
      })
    : getToken(options);

  const headers: Record<string, string> = {
    ...getApiVersionHeader(),
    authorization: `Bearer ${token}`,
  };

  if (options.contentType) {
    headers['x-content-type'] = options.contentType;
  }

  const blobApiResponse = await fetch(getApiUrl(`/${pathname}`), {
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

  const blobResult = (await blobApiResponse.json()) as PutBlobApiResponse;

  return blobResult;
}

// vercelBlob.del()

type DeleteBlobApiResponse = null;

// del accepts either a single url or an array of urls
// we use function overloads to define the return type accordingly
export async function del(
  url: string[] | string,
  options?: BlobCommandOptions,
): Promise<void> {
  const blobApiResponse = await fetch(getApiUrl('/delete'), {
    method: 'POST',
    headers: {
      ...getApiVersionHeader(),
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

  (await blobApiResponse.json()) as DeleteBlobApiResponse;
}

// vercelBlob.head()

export interface HeadBlobResult {
  url: string;
  size: number;
  uploadedAt: Date;
  pathname: string;
  contentType: string;
  contentDisposition: string;
}

interface HeadBlobApiResponse extends Omit<HeadBlobResult, 'uploadedAt'> {
  uploadedAt: string;
}

export async function head(
  url: string,
  options?: BlobCommandOptions,
): Promise<HeadBlobResult | null> {
  const headApiUrl = new URL(getApiUrl());
  headApiUrl.searchParams.set('url', url);

  const blobApiResponse = await fetch(headApiUrl, {
    method: 'GET', // HEAD can't have body as a response, so we use GET
    headers: {
      ...getApiVersionHeader(),
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

  const headResult = (await blobApiResponse.json()) as HeadBlobApiResponse;

  return mapBlobResult(headResult);
}

// vercelBlob.list()
interface ListBlobResultBlob {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
}

export interface ListBlobResult {
  blobs: ListBlobResultBlob[];
  cursor?: string;
  hasMore: boolean;
}

interface ListBlobApiResponseBlob
  extends Omit<ListBlobResultBlob, 'uploadedAt'> {
  uploadedAt: string;
}

interface ListBlobApiResponse extends Omit<ListBlobResult, 'blobs'> {
  blobs: ListBlobApiResponseBlob[];
}

export interface ListCommandOptions extends BlobCommandOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
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
      ...getApiVersionHeader(),
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

  const results = (await blobApiResponse.json()) as ListBlobApiResponse;

  return {
    ...results,
    blobs: results.blobs.map(mapBlobResult),
  };
}

function getApiUrl(pathname = ''): string {
  const baseUrl =
    process.env.VERCEL_BLOB_API_URL ||
    process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL ||
    'https://blob.vercel-storage.com';

  return `${baseUrl}${pathname}`;
}

function mapBlobResult(blobResult: HeadBlobApiResponse): HeadBlobResult;
function mapBlobResult(blobResult: ListBlobApiResponseBlob): ListBlobResultBlob;
function mapBlobResult(
  blobResult: ListBlobApiResponseBlob | HeadBlobApiResponse,
): ListBlobResultBlob | HeadBlobResult {
  return {
    ...blobResult,
    uploadedAt: new Date(blobResult.uploadedAt),
  };
}

function isAbsoluteUrl(url: string): boolean {
  try {
    return Boolean(new URL(url));
  } catch (e) {
    return false;
  }
}

async function retrieveClientToken(options: {
  pathname: string;
  handleBlobUploadUrl: string;
}): Promise<string> {
  const { handleBlobUploadUrl, pathname } = options;
  const url = isAbsoluteUrl(handleBlobUploadUrl)
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
    return clientToken;
  } catch (e) {
    throw new BlobError('Failed to retrieve the client token');
  }
}

interface ReturnPutCommandOptions {
  handleBlobUploadUrl: string;
  access: 'public';
  token: undefined;
}

function shouldFetchClientToken(
  options: PutCommandOptions,
): options is ReturnPutCommandOptions {
  return Boolean(!options.token && options.handleBlobUploadUrl);
}

function getApiVersionHeader(): { 'x-api-version'?: string } {
  const versionOverride = process.env.VERCEL_BLOB_API_VERSION_OVERRIDE;

  return {
    'x-api-version': `${versionOverride ?? BLOB_API_VERSION}`,
  };
}
