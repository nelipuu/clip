// Development web server transpiling TypeScript on the fly.

import { createServer, IncomingMessage, OutgoingHttpHeaders, STATUS_CODES } from 'http';
import { createReadStream, ReadStream, statSync } from 'fs';
import { builtinModules } from 'module';

import { rollup } from 'rollup';

import { typescript } from './rollup-typescript';

const mime: Record<string, string | undefined> = {
	html: 'text/html',
	txt: 'text/plain',
	css: 'text/css',
	js: 'text/javascript',
	ts: 'text/javascript',
	map: 'application/json',
	json: 'application/json'
};

const pub: Record<string, string | undefined> = {};

// List allowed URLs. Everything else will be blocked.
for(const valid of [
	'/',
	'/min.html',
	'/index.ts.map',
	'/src/index.ts',
]) {
	pub[valid] = '../' + (valid.substring(1) || 'index.html');
}

const server = createServer((req: IncomingMessage, res) => {
	const headers: OutgoingHttpHeaders = {
		'Content-Type': 'application/json',
		'Cache-Control': 'no-cache, no-store, must-revalidate',
		expires: '0'
	};

	let status: number | undefined;

	Promise.resolve().then(() => {
		console.log('%s', (req.method || 'GET') + ' ' + req.url);

		let key = pub[req.url || ''];

		if(req.method !== 'GET') {
			status = 405;
			headers['Allow'] = 'GET';
		}

		if(!key || status) {
			status = status || 403;
			return status + ' ' + STATUS_CODES[status];
		}

		status = 403;
		const extension = key.substring(key.lastIndexOf('.') + 1);

		key = decodeURI(new URL(key, import.meta.url).pathname);
		const stat = statSync(key);

		headers['Content-Type'] = mime[extension] || 'none';

		if(extension != 'ts') {
			status = 200;

			headers['Content-Length'] = stat.size;
			return createReadStream(key);
		}

		status = 500;

		return rollup({
			external: builtinModules,
			plugins: [typescript()],
			input: key
		}).then((bundle) => bundle.generate({
			sourcemap: true,
			format: 'iife'
		})).then((built) => {
			status = 200;

			const out = built.output[0];
			return out.code.replace('$__DEV', '  true') + (out.map ? '\n//# sourceMappingURL=' + out.map.toUrl() + '\n' : '');
		});
	}).catch((err: Error) => {
		if(status == 200) status = 500;
		console.error(err);

		return status ? status + ' ' + STATUS_CODES[status] : err.message
	}).then((body: string | Buffer | ReadStream) => {
		if(typeof body == 'string') body = Buffer.from(body);

		if(!Buffer.isBuffer(body)) {
			res.writeHead(status || 200, headers);
			body.pipe(res);
		} else {
			headers['Content-Length'] = body.length;

			res.writeHead(status || 200, headers);
			res.end(body);
		}
	});
});

function startServer(host: string, port: number) {
	function tryListen() {
		server.once('error', (err) => {
			if(err.code == 'EADDRINUSE') {
				++port;
				tryListen();
			} else {
				throw err;
			}
		});

		server.listen(port, host);
	}

	server.once('listening', () => console.log('Listening on port ' + port + '\n'));

	tryListen();
}

startServer('127.0.0.1', 8080);
