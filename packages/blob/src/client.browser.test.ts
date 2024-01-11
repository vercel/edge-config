import { upload } from './client';

describe('upload()', () => {
  it('should upload a file from the client', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            type: 'blob.generate-client-token',
            clientToken: 'fake-token-for-test',
          }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            url: `https://storeId.public.blob.vercel-storage.com/superfoo.txt`,
            pathname: 'foo.txt',
            contentType: 'text/plain',
            contentDisposition: 'attachment; filename="foo.txt"',
          }),
      });

    await expect(
      upload('foo.txt', 'Test file data', {
        access: 'public',
        handleUploadUrl: '/api/upload',
      }),
    ).resolves.toMatchInlineSnapshot(`
      {
        "contentDisposition": "attachment; filename="foo.txt"",
        "contentType": "text/plain",
        "pathname": "foo.txt",
        "url": "https://storeId.public.blob.vercel-storage.com/superfoo.txt",
      }
    `);

    const fetchMock = fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/upload',
      {
        body: '{"type":"blob.generate-client-token","payload":{"pathname":"foo.txt","callbackUrl":"http://localhost:3000/api/upload"}}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://blob.vercel-storage.com/foo.txt',
      {
        body: 'Test file data',
        duplex: 'half',
        headers: {
          authorization: 'Bearer fake-token-for-test',
          'x-api-version': '5',
        },
        method: 'PUT',
      },
    );
  });
});
