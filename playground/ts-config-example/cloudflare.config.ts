import { defineConfig } from '@flarelabs-net/cloudflare-config';
import * as worker from './src' with { type: 'cloudflare-worker' };

export const config = defineConfig({
	name: 'example-app',
	resources: {
		vars: {
			exampleVar: 'Example Var',
		},
	},
	entryWorker: {
		name: 'worker',
		module: worker,
		compatibilityDate: '2024-12-05',
	},
});
