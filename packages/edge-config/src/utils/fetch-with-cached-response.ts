export interface CachedResponsePair {
  etag: string;
  response: string;
}

type FetchOptions = Omit<RequestInit, 'headers'> & { headers?: Headers };

interface ResponseWithCachedResponse extends Response {
  cachedResponseBody?: unknown;
}

export const cache = new Map<string, CachedResponsePair>();

export async function fetchWithCachedResponse(
  url: string,
  options: FetchOptions = {}
): Promise<ResponseWithCachedResponse> {
  const { headers: customHeaders = new Headers(), ...customOptions } = options;
  const authHeader = customHeaders.get('Authorization');
  const cacheKey = `${url},${authHeader || ''}`;

  const cachedResponsePair = cache.get(cacheKey);

  if (cachedResponsePair) {
    const { etag, response: cachedResponse } = cachedResponsePair;
    const headers = new Headers(customHeaders);
    headers.set('If-None-Match', etag);

    const res: ResponseWithCachedResponse = await fetch(url, {
      ...customOptions,
      headers,
    });

    if (res.status === 304) {
      res.cachedResponseBody = JSON.parse(cachedResponse);
      return res;
    }

    const newETag = res.headers.get('ETag');
    if (res.ok && newETag)
      cache.set(cacheKey, {
        etag: newETag,
        response: await res.clone().text(),
      });
    return res;
  }

  const res = await fetch(url, options);
  const etag = res.headers.get('ETag');
  if (res.ok && etag)
    cache.set(cacheKey, { etag, response: await res.clone().text() });

  return res;
}
