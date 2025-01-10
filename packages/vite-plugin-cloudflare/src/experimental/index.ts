import { createMiddleware } from '@hattip/adapter-node';
import { Miniflare } from 'miniflare';
import * as vite from 'vite';
import { getNodeCompatAliases } from '../node-js-compat';
import { getOutputDirectory, toMiniflareRequest } from '../utils';
import {
	createCloudflareEnvironmentOptions,
	initRunners,
} from './cloudflare-environment';
import { getDevEntryWorker } from './dev';
import { getDevMiniflareOptions } from './miniflare-options';
import { resolvePluginConfig } from './plugin-config';
import type { PluginConfig, ResolvedPluginConfig } from './plugin-config';

export function cloudflare(pluginConfig: PluginConfig = {}): vite.Plugin {
	let resolvedPluginConfig: ResolvedPluginConfig;
	let miniflare: Miniflare | undefined;

	return {
		name: 'vite-plugin-cloudflare',
		async config(userConfig, env) {
			if (env.isPreview) {
				return { appType: 'custom' };
			}

			resolvedPluginConfig = await resolvePluginConfig(
				pluginConfig,
				userConfig,
			);

			return {
				appType: 'custom',
				resolve: {
					alias: getNodeCompatAliases(),
				},
				environments:
					resolvedPluginConfig.type === 'workers'
						? {
								...Object.fromEntries(
									Object.entries(resolvedPluginConfig.workers).map(
										([environmentName, workerConfig]) => {
											return [
												environmentName,
												createCloudflareEnvironmentOptions(
													workerConfig,
													userConfig,
													environmentName,
												),
											];
										},
									),
								),
								client: {
									build: {
										outDir: getOutputDirectory(userConfig, 'client'),
									},
								},
							}
						: undefined,
			};
		},
		resolveId(id) {
			if (id === 'cloudflare:bindings') {
				return `\0cloudflare:bindings`;
			}
		},
		load(id) {
			if (id === '\0cloudflare:bindings') {
				return `
					import { AsyncLocalStorage } from 'node:async_hooks';

					export const __bindingsStorage__ = new AsyncLocalStorage();

					export const vars = new Proxy({}, {
						get(_, key) {
							return __bindingsStorage__.getStore()[\`vars_\${key}\`];
						}
					});

					export const services = new Proxy({}, {
						get(_, key) {
							return __bindingsStorage__.getStore()[\`services_\${key}\`];
						}
					});
				`;
			}
		},
		handleHotUpdate(options) {
			if (options.file === resolvedPluginConfig.configPath) {
				// TODO: await/handle errors
				options.server.restart();
			}
		},
		async configureServer(viteDevServer) {
			miniflare = new Miniflare(
				getDevMiniflareOptions(resolvedPluginConfig, viteDevServer),
			);

			await initRunners(resolvedPluginConfig, viteDevServer, miniflare);
			const entryWorker = await getDevEntryWorker(
				resolvedPluginConfig,
				miniflare,
			);

			const middleware = createMiddleware(({ request }) => {
				return entryWorker.fetch(toMiniflareRequest(request), {
					redirect: 'manual',
				}) as any;
			});

			return () => {
				viteDevServer.middlewares.use((req, res, next) => {
					middleware(req, res, next);
				});
			};
		},
	};
}
