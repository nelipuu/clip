// Command line tool to inline stylesheets and scripts and minify a HTML file.

import { dirname, basename, resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { builtinModules } from 'module';

import { createCompilerHost, createProgram } from 'typescript';
import { rollup } from 'rollup';
import { minify } from 'terser';

import { typescript, compilerOptions } from './rollup-typescript';

/** Compile a TypeScript file and all its recursive imports. */

export function compileTS(key: string, cache: Record<string, string | undefined> = {}) {
	const host = createCompilerHost(compilerOptions);

	// Analyze entire program and emit transpiled files into a memory cache.
	const program = createProgram([key], compilerOptions, host);
	program.emit(void 0, (key, text) => { cache[key] = text; });
}

async function main() {
	const cache: Record<string, string | undefined> = {};
	const script: string[] = [];
	const entry = process.argv[2];
	const root = dirname(entry);

	let html = readFileSync(entry, 'utf-8').replace(/>\s+</g, '> <').replace(
		// Transpile, minify and inline TypeScript.
		/<script [^>]+><\/script>/g,
		(original) => {
			const match = original.match(/src="([^"]+)"/);
			if(!match) return original;

			const key = match[1];
			const index = script.length;
			script[index] = key;

			// Compile entire program and write emitted files in cache.
			compileTS(resolve(root, key), cache);

			// Write a placeholder string for script contents, replaced after async bundling and minification.
			return '<script>$JS_' + index + '\n</script>';
		}
	).replace(
		// Minify and inline CSS.
		/<link rel="stylesheet"( media="[^"]+")? href="([^"]+)">/g,
		(_, media, key) => (
			'<style' + media + '>' +
			readFileSync(resolve(root, key), 'utf-8').replace(/\s+/g, '').replace(/;}/g, '}') +
			'</style>'
		)
	);

	let cssClasses: string[] = [];
	let cssRules: string[] = [];

	for(let index = 0; index < script.length; ++index) {
		const bundle = await rollup({
			external: builtinModules,
			// TypeScript plugin should mainly return files already emitted into cache in compileTS.
			plugins: [typescript(cache)],
			input: resolve(root, script[index])
		});

		const built = await bundle.generate({
			sourcemap: true,
			format: 'iife'
		});

		const out = built.output[0];
		// Write intermediate source map inline so Terser finds it.
		let code = out.code + (out.map ? '\n//# sourceMappingURL=' + out.map.toUrl() + '\n' : '');
		const mapKey = basename(script[index] + '.map');

		/** Called from inside eval(). */
		function $__REPORT_CLASS(name: string, rules: string[]) {
			cssClasses.unshift(name);
			cssRules = cssRules.concat(rules);
		}

		const $__DEV = true;
		eval(code);

		const tersed = await minify(code, {
			sourceMap: {
				content: 'inline',
				url: mapKey
			},
			compress: {
				passes: 2,
				// pure_funcs: ['cssClass'] // Not needed if passes >= 2
				global_defs: {
					$__DEV: false
				},
				pure_getters: true,
				unsafe_comps: true,
				toplevel: true
			},
			format: {
				max_line_len: 200
			},
			mangle: {
				properties: {
					keep_quoted: 'strict'
				}
			}
		});

		// Write final source map next to html file.
		writeFileSync(resolve(root, mapKey), tersed.map!.toString(), 'utf-8');

		// Replace placeholder string with transpiled code.
		html = html.replace('$JS_' + index, () => tersed.code!);
	}

	if(cssRules.length) html = html.replace('</head>', () => '<style media="screen">' + cssRules.join('') + '</style></head>').replace('$__CLASSES', cssClasses.join(','));

	process.stdout.write(html + '\n');
}

main();
