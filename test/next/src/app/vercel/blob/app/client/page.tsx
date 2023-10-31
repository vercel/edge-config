'use client';

import { type PutBlobResult } from '@vercel/blob';
import { upload } from '@vercel/blob/client';
import { useRef, useState } from 'react';

export default function AppClientUpload(): JSX.Element {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<PutBlobResult | null>(null);
  return (
    <>
      <h1>App Router Client Upload</h1>

      <form
        onSubmit={async (event): Promise<void> => {
          event.preventDefault();

          const file = inputFileRef.current?.files?.[0];
          if (!file) {
            return;
          }

          const blobResult = await upload(file.name, file, {
            access: 'public',
            handleUploadUrl: `/vercel/blob/api/app/handle-blob-upload/edge`,
          });

          setBlob(blobResult);
        }}
      >
        <input name="file" ref={inputFileRef} type="file" />
        <button type="submit">Upload</button>
      </form>
      {blob ? (
        <div>
          Blob url: <a href={blob.url}>{blob.url}</a>
          {blob.url.endsWith('.mp4') ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- no caption for tests, this is fine
            <video autoPlay controls>
              <source src={blob.url} type="video/mp4" />
            </video>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
