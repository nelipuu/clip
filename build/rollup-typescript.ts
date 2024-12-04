import { existsSync, readFileSync } from 'fs';
import { resolve, dirname, normalize } from 'path';

import type { Plugin } from 'rollup';
import {
	CompilerOptions,
	ModuleKind,
	ScriptTarget,
	ModuleResolutionHost,

	sys,
	getDefaultCompilerOptions,
	createModuleResolutionCache,
	transpileModule,
	nodeModuleNameResolver
} from 'typescript';

import tsconfig from '../src/tsconfig.json';

export const compilerOptions: CompilerOptions = Object.assign({}, getDefaultCompilerOptions(), tsconfig.compilerOptions, {
	// Skip .d.ts files when bundling.
	noDtsResolution: true,
	sourceMap: true,

	// Don't check types in EcmaScript API declarations.
	skipDefaultLibCheck: true,
	// Don't check types in declarations.
	skipLibCheck: true,

	// Support dynamic import.
	module: ModuleKind.ES2020,

	// Support spread, Promise.prototype.finally (async/await is ES2017).
	target: ScriptTarget.ES2018
});

const tsHost: ModuleResolutionHost = {
	readFile: (key: string) => readFileSync(key, 'utf-8'),
	fileExists: (key: string) => existsSync(key),
	getCurrentDirectory: () => process.cwd()
};

const tsCache = createModuleResolutionCache(
	process.cwd(),
	(key) => sys.useCaseSensitiveFileNames ? key : key.toLowerCase(),
	compilerOptions
);

/** Rollup plugin to transpile TypeScript and use its module resolution logic. */

export const typescript = (cache: Record<string, string | undefined> = {}): Plugin => ({
	name: 'typescript',

	transform: (code: string, id: string) => {
		const jsKey = id.replace(/\.ts$/, '.js');
		const mapKey = id.replace(/\.ts$/, '.js.map');

		if(cache[jsKey]) {
			return {
				code: cache[jsKey],
				map: cache[mapKey]
			};
		}

		const out = transpileModule(code, { compilerOptions });

		return {
			code: out.outputText,
			map: out.sourceMapText
		};
	},

	resolveId(key: string, base?: string) {
		key = key.replace(/[?&].*/, '');

		const resolved = base && nodeModuleNameResolver(
			key,
			base,
			compilerOptions,
			tsHost,
			tsCache
		).resolvedModule;

		if(resolved) return normalize(resolved.resolvedFileName);

		return base ? resolve(dirname(base), key) : resolve(key);
	}
});
