import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Log, LogLevel, Response as MiniflareResponse } from 'miniflare';
import * as vite from 'vite';
import type { CloudflareDevEnvironment } from './cloudflare-environment';
import type {
	PersistState,
	ResolvedPluginConfig,
	WorkerConfig,
} from './plugin-config';
import type { MiniflareOptions, SharedOptions, WorkerOptions } from 'miniflare';
import type { FetchFunctionOptions } from 'vite/module-runner';

type PersistOptions = Pick<
	SharedOptions,
	| 'cachePersist'
	| 'd1Persist'
	| 'durableObjectsPersist'
	| 'kvPersist'
	| 'r2Persist'
	| 'workflowsPersist'
>;

function getPersistence(
	root: string,
	persistState: PersistState,
): PersistOptions {
	if (persistState === false) {
		return {};
	}

	const defaultPersistPath = '.wrangler/state';
	const persistPath = path.resolve(
		root,
		typeof persistState === 'object' ? persistState.path : defaultPersistPath,
		'v3',
	);

	return {
		cachePersist: path.join(persistPath, 'cache'),
		d1Persist: path.join(persistPath, 'd1'),
		durableObjectsPersist: path.join(persistPath, 'do'),
		kvPersist: path.join(persistPath, 'kv'),
		r2Persist: path.join(persistPath, 'r2'),
		workflowsPersist: path.join(persistPath, 'workflows'),
	};
}

const miniflareModulesRoot = process.platform === 'win32' ? 'Z:\\' : '/';
const ROUTER_WORKER_PATH = './asset-workers/router-worker.js';
const ASSET_WORKER_PATH = './asset-workers/asset-worker.js';
const WRAPPER_PATH = '__VITE_WORKER_ENTRY__';
const RUNNER_PATH = './runner-worker/index.js';

function getEntryWorkerConfig(
	resolvedPluginConfig: ResolvedPluginConfig,
): WorkerConfig | undefined {
	if (resolvedPluginConfig.type === 'assets-only') {
		return;
	}

	return resolvedPluginConfig.workers[
		resolvedPluginConfig.entryWorkerEnvironmentName
	];
}

export function getDevMiniflareOptions(
	resolvedPluginConfig: ResolvedPluginConfig,
	viteDevServer: vite.ViteDevServer,
): MiniflareOptions {
	const resolvedViteConfig = viteDevServer.config;
	const entryWorkerConfig = getEntryWorkerConfig(resolvedPluginConfig);

	const userWorkers =
		resolvedPluginConfig.type === 'workers'
			? Object.entries(resolvedPluginConfig.workers).map(
					([environmentName, workerConfig]) => {
						return {
							name: workerConfig.name,
							compatibilityDate: workerConfig.compatibilityDate,
							modulesRoot: miniflareModulesRoot,
							unsafeEvalBinding: '__VITE_UNSAFE_EVAL__',
							bindings: {
								__VITE_ROOT__: resolvedViteConfig.root,
								__VITE_ENTRY_PATH__: workerConfig.main,
							},
							serviceBindings: {
								// ...(environmentName ===
								// 	resolvedPluginConfig.entryWorkerEnvironmentName &&
								// workerConfig.assets?.binding
								// 	? {
								// 			[workerConfig.assets.binding]: ASSET_WORKER_NAME,
								// 		}
								// 	: {}),
								__VITE_INVOKE_MODULE__: async (request) => {
									const payload = (await request.json()) as vite.CustomPayload;
									const invokePayloadData = payload.data as {
										id: string;
										name: string;
										data: [string, string, FetchFunctionOptions];
									};

									assert(
										invokePayloadData.name === 'fetchModule',
										`Invalid invoke event: ${invokePayloadData.name}`,
									);

									const [moduleId] = invokePayloadData.data;

									// For some reason we need this here for cloudflare built-ins (e.g. `cloudflare:workers`) but not for node built-ins (e.g. `node:path`)
									// See https://github.com/flarelabs-net/vite-plugin-cloudflare/issues/46
									if (moduleId.startsWith('cloudflare:')) {
										const result = {
											externalize: moduleId,
											type: 'builtin',
										} satisfies vite.FetchResult;

										return new MiniflareResponse(JSON.stringify({ result }));
									}

									const devEnvironment = viteDevServer.environments[
										environmentName
									] as CloudflareDevEnvironment;

									const result = await devEnvironment.hot.handleInvoke(payload);

									return new MiniflareResponse(JSON.stringify(result));
								},
							},
						} satisfies Partial<WorkerOptions>;
					},
				)
			: [];

	const logger = new ViteMiniflareLogger(resolvedViteConfig);

	return {
		log: logger,
		handleRuntimeStdio(stdout, stderr) {
			const decoder = new TextDecoder();
			stdout.forEach((data) => logger.info(decoder.decode(data)));
			stderr.forEach((error) =>
				logger.logWithLevel(LogLevel.ERROR, decoder.decode(error)),
			);
		},
		...getPersistence(
			resolvedViteConfig.root,
			resolvedPluginConfig.persistState,
		),
		workers: [
			...userWorkers.map((workerOptions) => {
				const wrappers = [
					`import { createWorkerEntrypointWrapper, createDurableObjectWrapper, createWorkflowEntrypointWrapper } from '${RUNNER_PATH}';`,
					`export default createWorkerEntrypointWrapper('default');`,
				];

				return {
					...workerOptions,
					modules: [
						{
							type: 'ESModule',
							path: path.join(miniflareModulesRoot, WRAPPER_PATH),
							contents: wrappers.join('\n'),
						},
						{
							type: 'ESModule',
							path: path.join(miniflareModulesRoot, RUNNER_PATH),
							contents: fs.readFileSync(
								fileURLToPath(new URL(RUNNER_PATH, import.meta.url)),
							),
						},
					],
				} satisfies WorkerOptions;
			}),
		],
	};
}

/**
 * A Miniflare logger that forwards messages onto a Vite logger.
 */
class ViteMiniflareLogger extends Log {
	private logger: vite.Logger;
	constructor(config: vite.ResolvedConfig) {
		super(miniflareLogLevelFromViteLogLevel(config.logLevel));
		this.logger = config.logger;
	}

	override logWithLevel(level: LogLevel, message: string) {
		if (/^Ready on http/.test(message)) {
			level = LogLevel.DEBUG;
		}
		switch (level) {
			case LogLevel.ERROR:
				return this.logger.error(message);
			case LogLevel.WARN:
				return this.logger.warn(message);
			case LogLevel.INFO:
				return this.logger.info(message);
		}
	}
}

function miniflareLogLevelFromViteLogLevel(
	level: vite.LogLevel = 'info',
): LogLevel {
	switch (level) {
		case 'error':
			return LogLevel.ERROR;
		case 'warn':
			return LogLevel.WARN;
		case 'info':
			return LogLevel.INFO;
		case 'silent':
			return LogLevel.NONE;
	}
}
