import assert from 'node:assert';
import * as fsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { configSchema } from './schema';
import type { VarsInput } from './schema';
import type { build } from 'esbuild';

export type { Config } from './schema';

export function defineConfig<
	const TWorkers extends Record<
		string,
		{ compatibilityDate: string; module: Record<string, any> }
	>,
	const TVars extends VarsInput,
	const TServices extends {
		[K in keyof TServices]: {
			worker: keyof TWorkers;
			export: keyof TWorkers[TServices[K]['worker']]['module'];
		};
	},
>(config: {
	workers: TWorkers;
	entryWorker: keyof TWorkers;
	resources?: {
		vars?: TVars;
		services?: TServices;
	};
}) {
	return config;
}

export async function loadConfigFromFile(
	configPath: string,
	tempDirectory: string,
) {
	await fsp.mkdir(tempDirectory, { recursive: true });

	const bundled = await bundleConfigFile(configPath);
	const config = await loadConfigFromBundledFile(
		configPath,
		bundled.code,
		tempDirectory,
	);

	return configSchema.parse(config);
}

const _require = createRequire(import.meta.url);
const esbuild = _require('esbuild');

async function bundleConfigFile(path: string) {
	const result = await (esbuild.build as typeof build)({
		entryPoints: [path],
		write: false,
		target: [`node${process.versions.node}`],
		platform: 'node',
		bundle: true,
		format: 'esm',
		mainFields: ['main'],
		sourcemap: 'inline',
		plugins: [
			{
				name: 'cloudflare-worker-imports',
				setup(build) {
					build.onLoad({ filter: /.*/ }, async (args) => {
						if (args.with.type === 'cloudflare-worker') {
							return {
								contents: `export const __MODULE_PATH__ = ${JSON.stringify(args.path)};`,
							};
						}
					});
				},
			},
		],
	});
	const file = result.outputFiles[0];

	assert(file, `No output file`);

	return { code: file.text };
}

async function loadConfigFromBundledFile(
	filename: string,
	bundledCode: string,
	tempDirectory: string,
) {
	const hash = `timestamp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const tempFilename = path.join(
		tempDirectory,
		`${path.basename(filename)}.${hash}.mjs`,
	);

	await fsp.writeFile(tempFilename, bundledCode);

	try {
		return (await import(pathToFileURL(tempFilename).href)).config;
	} finally {
		fsp.unlink(tempFilename);
	}
}
