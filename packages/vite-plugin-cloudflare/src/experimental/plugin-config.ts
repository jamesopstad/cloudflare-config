import assert from 'node:assert';
import * as path from 'node:path';
import * as vite from 'vite';
import { loadConfigFromFile } from './config';
import type { Unstable_Config } from 'wrangler';

export type PersistState = boolean | { path: string };

export interface PluginConfig {
	persistState?: PersistState;
}

type Defined<T> = Exclude<T, undefined>;

interface AssetsOnlyConfig {
	name: Defined<Unstable_Config['name']>;
	compatibilityDate: Defined<Unstable_Config['compatibility_date']>;
	assets: Defined<Unstable_Config['assets']>;
}

interface WorkerConfig {
	name: Defined<Unstable_Config['name']>;
	main: Defined<Unstable_Config['main']>;
	compatibilityDate: Defined<Unstable_Config['compatibility_date']>;
}

interface BasePluginConfig {
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
}

export type ResolvedPluginConfig = AssetsOnlyPluginConfig | WorkersPluginConfig;

// Worker names can only contain alphanumeric characters and '-' whereas environment names can only contain alphanumeric characters and '$', '_'
function workerNameToEnvironmentName(workerName: string) {
	return workerName.replaceAll('-', '_');
}

export async function resolvePluginConfig(
	pluginConfig: PluginConfig,
	userConfig: vite.UserConfig,
): Promise<ResolvedPluginConfig> {
	const persistState = pluginConfig.persistState ?? true;
	const root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
	const config = await loadConfigFromFile(root);

	const { module, ...entryWorkerConfig } = config.entryWorker;
	const entryWorkerMain = module.__MODULE_PATH__;

	assert(
		entryWorkerMain,
		`Path not found. Did you use the import assertion when importing the module?`,
	);

	const entryWorkerEnvironmentName = workerNameToEnvironmentName(
		entryWorkerConfig.name,
	);

	const workers = {
		[entryWorkerEnvironmentName]: {
			...entryWorkerConfig,
			main: entryWorkerMain,
		},
	};

	return { type: 'workers', persistState, workers, entryWorkerEnvironmentName };
}
