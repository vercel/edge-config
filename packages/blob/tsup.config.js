import { defineConfig } from 'tsup';

// eslint-disable-next-line import/no-default-export -- tsup requires default export
export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts'],
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  minify: false,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: ['node_modules'],
});
