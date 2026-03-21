import { defineConfig } from 'vite';

export default defineConfig({
  ssr: {
    // @zxcvbn-ts/core ships CJS with no `exports` field.
    // Angular's test runner serves jsdom tests via vite-node (the SSR path),
    // so the relevant setting is ssr.noExternal, not optimizeDeps.
    // Without this entry, Vite externalises the package and loads raw CJS on a
    // cold cache, causing angular:vitest-mock-patch to crash with a .trim() on
    // undefined when vi.mock tries to enumerate the module's exports.
    // Listing it here forces Vite to inline and transform the package to ESM
    // before any test file runs, making vi.mock reliable on a fresh checkout.
    noExternal: ['@zxcvbn-ts/core'],
  },
});
