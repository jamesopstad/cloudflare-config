export default {
	async fetch(request, env) {
		console.log(env);

		return new Response('Hello World!');
	},
} satisfies ExportedHandler;
