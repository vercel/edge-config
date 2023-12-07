import type { Readable } from 'node:stream';
import type { BodyInit } from 'undici';
import { fetch } from 'undici';
import type { ClientPutCommandOptions } from './client';
import type { CreateBlobCommandOptions } from './helpers';
import {
  getApiUrl,
  getApiVersionHeader,
  getTokenFromOptionsOrEnv,
  BlobError,
  validateBlobApiResponse,
} from './helpers';
import { multipartPut } from './put-multipart';

// eslint-disable-next-line @typescript-eslint/no-empty-interface -- expose option interface for each API method for better extensibility in the future
export interface PutCommandOptions extends CreateBlobCommandOptions {}

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

export type PutBody =
  | string
  | Readable // Node.js streams
  | Blob
  | ArrayBuffer
  | ReadableStream // Streams API (= Web streams in Node.js)
  | File;

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export function createPutMethod<
  T extends PartialBy<PutCommandOptions & ClientPutCommandOptions, 'token'>,
>({
  allowedOptions,
  getToken,
  extraChecks,
}: {
  allowedOptions: (keyof typeof putOptionHeaderMap)[];
  getToken?: (pathname: string, options: T) => Promise<string>;
  extraChecks?: (options: T) => void;
}) {
  return async function put(
    pathname: string,
    body: PutBody,
    options?: T,
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime check for DX.
    if (options.access !== 'public') {
      throw new BlobError('access must be "public"');
    }

    if (extraChecks) {
      extraChecks(options);
    }

    const token = getToken
      ? await getToken(pathname, options)
      : getTokenFromOptionsOrEnv(options);

    const baseHeaders: Record<string, string> = {
      ...getApiVersionHeader(),
      authorization: `Bearer ${token}`,
    };

    const headersForCreate: Record<string, string> = {};

    if (allowedOptions.includes('contentType') && options.contentType) {
      headersForCreate['x-content-type'] = options.contentType;
    }

    if (
      allowedOptions.includes('addRandomSuffix') &&
      options.addRandomSuffix !== undefined
    ) {
      headersForCreate['x-add-random-suffix'] = options.addRandomSuffix
        ? '1'
        : '0';
    }

    if (
      allowedOptions.includes('cacheControlMaxAge') &&
      options.cacheControlMaxAge !== undefined
    ) {
      headersForCreate['x-cache-control-max-age'] =
        options.cacheControlMaxAge.toString();
    }

    if (options.multipartUpload === true) {
      const blobApiResponse = await multipartPut(
        pathname,
        body,
        baseHeaders,
        headersForCreate,
      );
      // TODO await validateBlobApiResponse(blobApiResponse);
      console.log(blobApiResponse);
      return blobApiResponse;
    }

    const blobApiResponse = await fetch(getApiUrl(`/${pathname}`), {
      method: 'PUT',
      body: body as BodyInit,
      headers: {
        ...baseHeaders,
        ...headersForCreate,
      },
      // required in order to stream some body types to Cloudflare
      // currently only supported in Node.js, we may have to feature detect this
      duplex: 'half',
    });

    await validateBlobApiResponse(blobApiResponse);

    const blobResult = (await blobApiResponse.json()) as PutBlobApiResponse;

    return blobResult;
  };
}
