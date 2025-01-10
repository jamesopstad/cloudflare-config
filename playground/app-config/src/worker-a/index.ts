import { services, vars } from 'cloudflare:bindings';

export default {
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === '/worker-b') {
			return services.workerB.fetch(request);
		}

		if (url.pathname === '/rpc') {
			const result = await services.rpc.add(2, 3);

			return Response.json({ name: 'Named entrypoint RPC', result });
		}

		return Response.json({ name: 'Worker A', value: vars.exampleVar });
	},
} satisfies ExportedHandler;
