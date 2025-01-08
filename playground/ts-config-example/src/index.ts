import { vars } from 'cloudflare:bindings';

export default {
	async fetch(request, env) {
		return new Response(`The var is ${vars.exampleVar}`);
	},
} satisfies ExportedHandler;
