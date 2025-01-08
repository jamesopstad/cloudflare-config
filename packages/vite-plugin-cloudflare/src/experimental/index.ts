import * as vite from 'vite';
import { resolvePluginConfig } from './config';

export function cloudflare(): vite.Plugin {
	return {
		name: 'vite-plugin-cloudflare',
		async config(userConfig, env) {
			if (env.isPreview) {
				return { appType: 'custom' };
			}

			const resolvedPluginConfig = await resolvePluginConfig(userConfig);

			console.log(resolvedPluginConfig);
		},
	};
}
