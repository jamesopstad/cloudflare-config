declare module 'cloudflare:bindings' {
	export interface Register {}

	type RegisteredConfig = Register extends { config: infer TConfig }
		? TConfig
		: never;

	interface Constructor<T> {
		new (...args: any[]): T;
	}

	type Workers = RegisteredConfig['workers'];
	type Vars = RegisteredConfig extends { resources?: { vars?: infer T } }
		? T
		: never;
	type Services = RegisteredConfig extends {
		resources?: { services?: infer T };
	}
		? T
		: never;

	export const vars: Vars;
	export const services: {
		[K in keyof Services]: Services[K] extends infer TService
			? Workers[TService['worker']]['module'][TService['export']] extends infer TExport
				? TExport extends Constructor<Rpc.WorkerEntrypointBranded>
					? Service<InstanceType<TExport>>
					: TExport extends ExportedHandler
						? Service
						: never
				: never
			: never;
	};
}
