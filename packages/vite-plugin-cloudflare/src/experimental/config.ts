import assert from 'node:assert';
import * as fsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vite from 'vite';
import type { build } from 'esbuild';

// Worker names can only contain alphanumeric characters and '-' whereas environment names can only contain alphanumeric characters and '$', '_'
function workerNameToEnvironmentName(workerName: string) {
	return workerName.replaceAll('-', '_');
}

export async function resolvePluginConfig(userConfig: vite.UserConfig) {
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

	return { type: 'workers', workers, entryWorkerEnvironmentName };
}

async function loadConfigFromFile(root: string) {
	const resolvedPath = path.resolve(root, 'cloudflare.config.ts');
	const tempDirectory = path.resolve(root, '.wrangler', 'tmp');

	await fsp.mkdir(tempDirectory, { recursive: true });

	const bundled = await bundleConfigFile(resolvedPath);
	const config = await loadConfigFromBundledFile(
		resolvedPath,
		bundled.code,
		tempDirectory,
	);

	return config;
}

const _require = createRequire(import.meta.url);

async function bundleConfigFile(path: string) {
	const esbuild = _require('esbuild');
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
								contents: `export const __MODULE_PATH__ = ${JSON.stringify(args.path)}`,
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
