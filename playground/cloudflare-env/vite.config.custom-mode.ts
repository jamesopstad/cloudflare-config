import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
	mode: 'custom-mode',
	plugins: [cloudflare({ persistState: false })],
});
