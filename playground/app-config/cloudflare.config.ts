import { defineConfig } from '@flarelabs-net/cloudflare-config';
import * as workerA from './src/worker-a' with { type: 'cloudflare-worker' };
import * as workerB from './src/worker-b' with { type: 'cloudflare-worker' };

export const config = defineConfig({
	name: 'example-app',
	workers: {
		workerA: {
			compatibilityDate: '2024-12-05',
			module: workerA,
		},
		workerB: {
			compatibilityDate: '2024-12-05',
			module: workerB,
		},
	},
	entryWorker: 'workerA',
	resources: {
		vars: {
			exampleVar: 'Example var',
		},
		services: {
			workerB: {
				worker: 'workerB',
				export: 'default',
			},
			rpc: {
				worker: 'workerB',
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
