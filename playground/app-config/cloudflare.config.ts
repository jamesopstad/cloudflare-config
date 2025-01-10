import { defineConfig } from '@flarelabs-net/cloudflare-config';
import * as worker from './src' with { type: 'cloudflare-worker' };

export const config = defineConfig({
	workers: {
		workerA: {
			compatibilityDate: '2024-12-05',
			module: worker,
		},
	},
	entryWorker: 'workerA',
	resources: {
		vars: {
			exampleVar: 'Example var',
		},
		services: {
			exampleService: {
				worker: 'workerA',
				export: 'NamedEntrypoint',
			},
		},
	},
});

declare module 'cloudflare:bindings' {
	interface Register {
		config: typeof config;
	}
}
