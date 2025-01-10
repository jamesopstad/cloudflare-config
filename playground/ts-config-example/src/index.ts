import { services, vars } from 'cloudflare:bindings';
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

export class Counter extends DurableObject {}

export class NamedEntrypoint extends WorkerEntrypoint {
	override fetch(request: Request) {
		// return services.exampleService.fetch(request);
		return new Response(`The var is ${vars.exampleVar}`);
	}
	add(a: number, b: number) {
		return a + b;
	}
}

export default {
	async fetch(request) {
		return Response.json({
			value: await services.exampleService.add(1, 2),
		});
		// return services.exampleService
		// return new Response(`The var is ${vars.exampleVar}`);
	},
} satisfies ExportedHandler;
