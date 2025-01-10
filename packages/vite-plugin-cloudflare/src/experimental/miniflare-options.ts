import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Log, LogLevel, Response as MiniflareResponse } from 'miniflare';
import * as vite from 'vite';
import { cloudflareBuiltInModules } from './cloudflare-environment';
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

function getMiniflareBindings(resolvedPluginConfig: ResolvedPluginConfig) {
	const bindings: WorkerOptions['bindings'] = {};
	const serviceBindings: WorkerOptions['serviceBindings'] = {};

	if (resolvedPluginConfig.type === 'workers') {
		const { resources } = resolvedPluginConfig;

		for (const [key, value] of Object.entries(resources.vars ?? {})) {
			bindings[`vars_${key}`] = value;
		}

		for (const [key, value] of Object.entries(resources.services ?? {})) {
			serviceBindings[`services_${key}`] = {
				name: value.worker,
				entrypoint: value.export,
			};
		}
	}

	return { bindings, serviceBindings };
}

function missingWorkerErrorMessage(workerName: string) {
	return `${workerName} does not match a worker name.`;
}

function getWorkerToWorkerEntrypointExportsMap(
	resolvedPluginConfig: ResolvedPluginConfig,
) {
	if (resolvedPluginConfig.type === 'assets-only') {
		return new Map<string, Set<string>>();
	}

	const workerToWorkerEntrypointExportsMap = new Map(
		Object.values(resolvedPluginConfig.workers).map((workerConfig) => [
			workerConfig.name,
			new Set<string>(),
		]),
	);

	for (const service of Object.values(
		resolvedPluginConfig.resources.services ?? {},
	)) {
		if (service.export) {
			const entrypointExports = workerToWorkerEntrypointExportsMap.get(
				service.worker,
			);
			assert(entrypointExports, missingWorkerErrorMessage(service.worker));

			entrypointExports.add(service.export);
		}
	}

	return workerToWorkerEntrypointExportsMap;
}

export function getDevMiniflareOptions(
	resolvedPluginConfig: ResolvedPluginConfig,
	viteDevServer: vite.ViteDevServer,
): MiniflareOptions {
	const resolvedViteConfig = viteDevServer.config;
	const miniflareBindings = getMiniflareBindings(resolvedPluginConfig);
	const workerToWorkerEntrypointExportsMap =
		getWorkerToWorkerEntrypointExportsMap(resolvedPluginConfig);

	const userWorkers =
		resolvedPluginConfig.type === 'workers'
			? Object.entries(resolvedPluginConfig.workers).map(
					([environmentName, workerConfig]) => {
						const wrappers = [
							`import { createWorkerEntrypointWrapper, createDurableObjectWrapper, createWorkflowEntrypointWrapper } from '${RUNNER_PATH}';`,
							`export default createWorkerEntrypointWrapper('default');`,
						];

						const workerEntrypointExports =
							workerToWorkerEntrypointExportsMap.get(workerConfig.name);
						assert(
							workerEntrypointExports,
							`WorkerEntrypoint exports not found for worker ${workerConfig.name}`,
						);

						for (const entrypointExport of [
							...workerEntrypointExports,
						].sort()) {
							wrappers.push(
								`export const ${entrypointExport} = createWorkerEntrypointWrapper('${entrypointExport}');`,
							);
						}

						return {
							name: workerConfig.name,
							compatibilityDate: workerConfig.compatibilityDate,
							compatibilityFlags: ['nodejs_als'],
							modulesRoot: miniflareModulesRoot,
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
							unsafeEvalBinding: '__VITE_UNSAFE_EVAL__',
							bindings: {
								...miniflareBindings.bindings,
								__VITE_ROOT__: resolvedViteConfig.root,
								__VITE_ENTRY_PATH__: workerConfig.module,
							},
							serviceBindings: {
								...miniflareBindings.serviceBindings,
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
									if (cloudflareBuiltInModules.includes(moduleId)) {
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
		workers: [...userWorkers],
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
