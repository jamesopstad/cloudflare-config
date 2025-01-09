// @ts-ignore
import { vars } from 'cloudflare:bindings';
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

export class Counter extends DurableObject {}

export class NamedEntrypoint extends WorkerEntrypoint {}

export default {
	async fetch() {
		return new Response(`The var is ${vars.exampleVar}`);
	},
};
