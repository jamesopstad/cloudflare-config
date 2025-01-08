import * as vite from 'vite';
import { resolvePluginConfig } from './plugin-config';
import type { PluginConfig } from './plugin-config';

export function cloudflare(pluginConfig: PluginConfig = {}): vite.Plugin {
	return {
		name: 'vite-plugin-cloudflare',
		async config(userConfig, env) {
			if (env.isPreview) {
				return { appType: 'custom' };
			}

			const resolvedPluginConfig = await resolvePluginConfig(
				pluginConfig,
				userConfig,
			);

			console.log(resolvedPluginConfig);

			return {
				appType: 'custom',
				// resolve: {
				// 	alias: getNodeCompatAliases()
				// },
			};
		},
	};
}
