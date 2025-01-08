import type { Unstable_RawEnvironment as RawEnvironment } from 'wrangler';

type SnakeToCamelCase<T extends string> = T extends `${infer L}_${infer R}`
	? `${L}${Capitalize<SnakeToCamelCase<R>>}`
	: T;

type KeysToCamelCase<T extends Record<string, any>> = {
	[K in keyof T as SnakeToCamelCase<string & K>]: T[K];
};

type NormalizedRecord<T extends Record<string, any>> = Record<
	string,
	Omit<KeysToCamelCase<T>, 'binding'>
>;

type Defined<T> = Exclude<T, undefined>;

interface Resources extends Record<string, any> {
	analyticsEngineDatasets?: NormalizedRecord<
		Defined<RawEnvironment['analytics_engine_datasets']>[number]
	>;
	d1Databases?: NormalizedRecord<
		Defined<RawEnvironment['d1_databases']>[number]
	>;
	dispatchNamespaces?: NormalizedRecord<
		Defined<RawEnvironment['dispatch_namespaces']>[number]
	>;
	hyperdrive?: NormalizedRecord<Defined<RawEnvironment['hyperdrive']>[number]>;
	kvNamespaces?: NormalizedRecord<
		Defined<RawEnvironment['kv_namespaces']>[number]
	>;
	mtlsCertificates?: NormalizedRecord<
		Defined<RawEnvironment['mtls_certificates']>[number]
	>;
	queueProducers?: NormalizedRecord<
		Defined<Defined<RawEnvironment['queues']>['producers']>[number]
	>;
	r2Buckets?: NormalizedRecord<Defined<RawEnvironment['r2_buckets']>[number]>;
	sendEmail?: NormalizedRecord<Defined<RawEnvironment['send_email']>[number]>;
	vectorize?: NormalizedRecord<Defined<RawEnvironment['vectorize']>[number]>;
}

type Environment = {
	accountId?: Defined<RawEnvironment['account_id']>;
	vars?: Defined<RawEnvironment['vars']>;
} & Resources;

type Environments = Record<string, Environment>;

interface BaseWorker {
	name: string;
	module: Record<string, any>;
	compatibilityDate: `${string}-${string}-${string}`;
}

interface EntryWorker extends BaseWorker {}

export function defineConfig(config: { entryWorker: EntryWorker }) {
	return config;
}
