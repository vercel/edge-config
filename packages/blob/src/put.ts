import type { Readable } from 'node:stream';
import type { BodyInit } from 'undici';
import { fetch } from 'undici';
import type { ClientPutCommandOptions } from './client';
import {
  BlobAccessError,
  BlobUnknownError,
  getApiUrl,
  getApiVersionHeader,
  getTokenFromOptionsOrEnv,
  BlobError,
} from './helpers';
import { type PutCommandOptions } from '.';

const putOptionHeaderMap = {
  cacheControlMaxAge: 'x-cache-control-max-age',
  addRandomSuffix: 'x-add-random-suffix',
  contentType: 'x-content-type',
};

export interface PutBlobResult {
  url: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
}

export type PutBlobApiResponse = PutBlobResult;

export function createPutMethod<
  T extends PutCommandOptions & ClientPutCommandOptions
>(allowedOptions: (keyof typeof putOptionHeaderMap)[]) {
  return async function put(
    pathname: string,
    body:
      | string
      | Readable
      | Blob
      | ArrayBuffer
      | FormData
      | ReadableStream
      | File,
    options?: T
  ): Promise<PutBlobResult> {
    if (!pathname) {
      throw new BlobError('pathname is required');
    }

    if (!body) {
      throw new BlobError('body is required');
    }

    if (!options) {
      throw new BlobError('missing options, see usage');
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime check for DX
    if (options.access !== 'public') {
      throw new BlobError('access must be "public"');
    }

    const token = getTokenFromOptionsOrEnv(options);

    const headers: Record<string, string> = {
      ...getApiVersionHeader(),
      authorization: `Bearer ${token}`,
    };

    if (allowedOptions.includes('contentType') && options.contentType) {
      headers['x-content-type'] = options.contentType;
    }

    if (
      allowedOptions.includes('addRandomSuffix') &&
      options.addRandomSuffix !== undefined
    ) {
      headers['x-add-random-suffix'] = options.addRandomSuffix ? '1' : '0';
    }

    if (
      allowedOptions.includes('cacheControlMaxAge') &&
      options.cacheControlMaxAge !== undefined
    ) {
      headers['x-cache-control-max-age'] =
        options.cacheControlMaxAge.toString();
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
  };
}
