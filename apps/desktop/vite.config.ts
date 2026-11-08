import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
// sharp is the workspace root's dependency, the one the asset generators use.
import sharp from 'sharp';
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

/**
 * Encodes the game art the build ships. The repository keeps every image in
 * src/assets lossless, as the generators in scripts/ write it, so no detail
 * is lost for good; the built app carries copies at WebP quality 90, which
 * looks the same at the size the screens draw them and is a fraction of the
 * size. The skill rings stay lossless: lossy coding shifts their faint,
 * colour-divided light. Dev servers serve the lossless files as they are.
 */
function shipArt(): Plugin {
  return {
    name: 'dsa-ship-art',
    apply: 'build',
    async generateBundle(_options, bundle) {
      const encoded = await Promise.all(
        Object.values(bundle).map(async (file) => {
          if (file.type !== 'asset' || !file.fileName.endsWith('.webp')) return 0;
          if (basename(file.fileName).startsWith('skill-ring-')) return 0;
          const before = file.source.length;
          file.source = await sharp(Buffer.from(file.source))
            .webp({ quality: 90, alphaQuality: 100, effort: 6 })
            .toBuffer();
          return before - file.source.length;
        }),
      );
      const saved = encoded.reduce((sum, bytes) => sum + bytes, 0);
      this.info(`game art encoded for shipping, ${(saved / 1048576).toFixed(1)} MB smaller`);
    },
  };
}

// `--mode preview` builds the browser preview (preview.html) instead of the app.
export default defineConfig(({ mode }) => ({
  plugins: [lfsArt(), react(), tailwindcss(), previewFixture(), shipArt()],
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
