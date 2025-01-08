import { cloudflare } from '@flarelabs-net/vite-plugin-cloudflare/experimental';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [cloudflare()],
});
