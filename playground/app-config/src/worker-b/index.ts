import { WorkerEntrypoint } from 'cloudflare:workers';

export class NamedEntrypoint extends WorkerEntrypoint {
	add(a: number, b: number) {
		return a + b;
	}
}

export default {
	async fetch(request) {
		return Response.json({ name: 'Worker B' });
	},
} satisfies ExportedHandler;
