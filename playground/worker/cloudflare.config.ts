import * as worker from './src' with { type: 'cloudflare-worker' };

export const config = {
	name: 'Cloudflare',
	module: worker,
};
