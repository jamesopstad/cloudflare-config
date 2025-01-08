import { vars } from 'cloudflare:bindings';

export default {
	async fetch(request, env) {
		console.log(vars.exampleVar);

		return new Response('Hello World!');
	},
} satisfies ExportedHandler;
