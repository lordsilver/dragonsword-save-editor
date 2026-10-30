import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
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

/**
 * Refuses to build when the game's art in src/assets is still Git LFS pointer
 * files. A checkout without LFS (no `git lfs install`, or actions/checkout
 * without `lfs: true`) leaves 130-byte text files where the images belong,
 * and the app then draws every icon, tile and card blank, as v0.1.0 did.
 */
function lfsArt(): Plugin {
  return {
    name: 'dsa-lfs-art',
    buildStart() {
      const folder = fileURLToPath(new URL('./src/assets', import.meta.url));
      const pointers = readdirSync(folder).filter((name) => {
        const head = Buffer.alloc(48);
        const file = openSync(join(folder, name), 'r');
        try {
          readSync(file, head, 0, head.length, 0);
        } finally {
          closeSync(file);
        }
        return head.toString('latin1').startsWith('version https://git-lfs.github.com/spec/');
      });
      if (pointers.length > 0) {
        this.error(
          `${pointers.length} files in src/assets are Git LFS pointers, not images (${pointers.slice(0, 3).join(', ')}…). ` +
            'Run `git lfs install` and `git lfs pull`, or check out with `lfs: true`, then build again.',
        );
      }
    },
  };
}

// `--mode preview` builds the browser preview (preview.html) instead of the app.
export default defineConfig(({ mode }) => ({
  plugins: [lfsArt(), react(), tailwindcss(), previewFixture()],
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
