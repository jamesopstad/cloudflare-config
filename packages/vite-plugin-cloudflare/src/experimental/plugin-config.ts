import * as path from 'node:path';
import { loadConfigFromFile } from '@flarelabs-net/cloudflare-config';
import * as vite from 'vite';
import type { Config } from '@flarelabs-net/cloudflare-config';
import type { Unstable_Config } from 'wrangler';

export type PersistState = boolean | { path: string };

export interface PluginConfig {
	persistState?: PersistState;
}

type Defined<T> = Exclude<T, undefined>;

export interface AssetsOnlyConfig {
	name: Defined<Unstable_Config['name']>;
	compatibilityDate: Defined<Unstable_Config['compatibility_date']>;
	assets: Defined<Unstable_Config['assets']>;
}

export interface WorkerConfig {
	name: Defined<Unstable_Config['name']>;
	module: Defined<Unstable_Config['main']>;
	compatibilityDate: Defined<Unstable_Config['compatibility_date']>;
	assets?: any;
}

interface BasePluginConfig {
	configPath: string;
	persistState: PersistState;
}

interface AssetsOnlyPluginConfig extends BasePluginConfig {
	type: 'assets-only';
	config: AssetsOnlyConfig;
}

interface WorkersPluginConfig extends BasePluginConfig {
	type: 'workers';
	workers: Record<string, WorkerConfig>;
	entryWorkerEnvironmentName: string;
	resources: Config['resources'];
	bindings: any;
}

export type ResolvedPluginConfig = AssetsOnlyPluginConfig | WorkersPluginConfig;

// Worker names can only contain alphanumeric characters and '-' whereas environment names can only contain alphanumeric characters and '$', '_'
function workerNameToEnvironmentName(workerName: string) {
	return workerName.replaceAll('-', '_');
}

function extractBindings(resources: Config['resources']) {
	const vars: Config['resources']['vars'] = {};

	for (const [key, value] of Object.entries(resources.vars ?? {})) {
		vars[`vars_${key}`] = value;
	}

	return { vars };
}

export async function resolvePluginConfig(
	pluginConfig: PluginConfig,
	userConfig: vite.UserConfig,
): Promise<ResolvedPluginConfig> {
	const persistState = pluginConfig.persistState ?? true;
	const root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
	const configPath = path.resolve(root, 'cloudflare.config.ts');
	const tempDirectory = path.resolve(root, '.wrangler', 'tmp');
	const config = await loadConfigFromFile(configPath, tempDirectory);
	const workers = Object.fromEntries(
		Object.entries(config.workers).map(([name, workerConfig]) => [
			name,
			{ ...workerConfig, name },
		]),
	);

	return {
		type: 'workers',
		configPath,
		persistState,
		workers,
		entryWorkerEnvironmentName: config.entryWorker,
		resources: config.resources,
		bindings: extractBindings(config.resources),
	};
}
