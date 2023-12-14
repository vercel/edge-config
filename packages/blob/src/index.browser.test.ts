import { put } from './index';

describe('blob client', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('put', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });

    it('should upload a file from the client', async () => {
      await expect(
        put('foo.txt', 'Test Body', {
          access: 'public',
          token: 'vercel_blob_client_123_token',
        }),
      ).resolves.toMatchInlineSnapshot(`
        {
          "contentDisposition": "attachment; filename="foo.txt"",
          "contentType": "text/plain",
          "pathname": "foo.txt",
          "url": "https://storeId.public.blob.vercel-storage.com/foo-id.txt",
        }
      `);
    });
  });
});
