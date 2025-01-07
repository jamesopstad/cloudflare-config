import { defineConfig } from '@flarelabs-net/cloudflare-config';
import * as worker from './src' with { type: 'cloudflare-worker' };

export const config = defineConfig({
	name: 'Cloudflare',
	module: worker,
});
