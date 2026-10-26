import { readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { type Connect, type Plugin, defineConfig } from 'vite';

/**
 * Serves a recording made by the `preview_fixture` example to `preview.html`.
 * `DSA_PREVIEW_FIXTURE` names one recording, or a folder of them that the
 * page picks from with `?fixture=<name>` (default `fixture`).
 */
function previewFixture(): Plugin {
  const serve: Connect.NextHandleFunction = (request, response) => {
    const root = process.env.DSA_PREVIEW_FIXTURE;
    if (!root) {
      response.statusCode = 404;
      response.end('Set DSA_PREVIEW_FIXTURE to a file written by the preview_fixture example.');
      return;
    }
    const name = new URL(request.url ?? '', 'http://preview').searchParams.get('name') ?? 'fixture';
    const path = statSync(root).isDirectory() ? join(root, `${basename(name)}.json`) : root;
    response.setHeader('Content-Type', 'application/json');
    response.end(readFileSync(path));
  };
  return {
    name: 'dsa-preview-fixture',
    configureServer(server) {
      server.middlewares.use('/__preview/fixture.json', serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/__preview/fixture.json', serve);
    },
  };
}

// `--mode preview` builds the browser preview (preview.html) instead of the app.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), previewFixture()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 1421,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    ...(mode === 'preview' && {
      outDir: 'dist-preview',
      rollupOptions: { input: fileURLToPath(new URL('./preview.html', import.meta.url)) },
    }),
  },
}));
