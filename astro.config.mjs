// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// L'appli est une "page unique" : Astro fabrique la coquille HTML,
// et les écrans (Svelte) s'affichent dans le navigateur.
export default defineConfig({
  integrations: [svelte()],
  compressHTML: true,
  devToolbar: { enabled: false },
});
