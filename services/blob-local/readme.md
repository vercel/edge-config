# Blob-Local

Blob-Local is a server for `@vercel/blob` which writes to the local filesystem instead of the cloud. It allows you to test and develop your applications locally without needing access to the hosted `@vercel/blob` store.

## Installation

First of all you should add these Environment Variables to you project so that the `@vercel/blob` SDK talks to your local server:

```bash
NEXT_PUBLIC_VERCEL_BLOB_API_URL=http://localhost:3001/api
VERCEL_BLOB_API_URL=http://localhost:3001/api
```

Clone the repository:

```bash
git clone git@github.com:vercel/blob-local.git
cd blob-local
```

Build and run the container:

```bash
pnpm --filter @vercel/blob-local docker:build
pnpm --filter @vercel/blob-local docker:run
```

After this you can start and stop the `vercel-blob-local` container like this:

```bash
docker start vercel-blob-local
docker stop vercel-blob-local
```

or using the pnpm scripts:

```bash
pnpm --filter @vercel/blob-local docker:start
pnpm --filter @vercel/blob-local docker:stop
```

## Development

For development you need to install [Go](https://go.dev/doc/install) and [WGO](https://github.com/bokwoon95/wgo).

Start the server:

```bash
pnpm --filter @vercel/blob-local dev
```

If you want a watcher that restarts the server on file changes you can use something like [wgo](https://github.com/bokwoon95/wgo)

```bash
ENV=dev wgo run main.go
```
