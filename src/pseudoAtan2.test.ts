import { pseudoAtan2, compareAngles } from './pseudoAtan2';

const tests = [
	[-0.5, -1.0],
	[-1.0, -1.0],
	[-1.0, -0.5],
	[-1.0, +0.0],
	[-1.0, +0.5],
	[-1.0, +1.0],
	[-0.5, +1.0],
	[+0.0, +1.0],
	[+0.5, +1.0],
	[+1.0, +1.0],
	[+1.0, +0.5],
	[+1.0, +0.0],
	[+1.0, -0.5],
	[+1.0, -1.0],
	[+0.5, -1.0],
	[+0.0, -1.0]
];

function expect<Args, Result>(fn: (...args: Args[]) => Result, args: Args[], isFailed: (result: Result) => boolean, msg: string) {
	const result = fn.apply(null, args);
	if(isFailed(result)) console.error(fn.name + '(' + args.map((arg) => JSON.stringify(arg)).join(', ') + ') = ' + result + ' ' + msg);
}

for(let i = 0; i < 1000; ++i) {
	const test = tests[i];
	const x = test ? test[1] : Math.random() - 0.5;
	const y = test ? test[0] : Math.random() - 0.5;

	const expected = Math.atan2(y, x);

	expect(pseudoAtan2, [y, x], (result) => Math.abs(result * Math.PI / 4 - expected) > 0.071114637602452, 'is too far from ' + expected / Math.PI * 4);
}

for(let i = 1; i < tests.length; ++i) {
	const [x1, y1] = tests[i - 1];
	const [x2, y2] = tests[i];
	const sign = i < tests.length - 1 ? 1 : -1;

	expect(compareAngles, [{ x: 0, y: 0 }, { x: x1, y: y1 }, { x: x1, y: y1 }], (result) => result != 0, '!= 0');
	expect(compareAngles, [{ x: 0, y: 0 }, { x: x1, y: y1 }, { x: x2, y: y2 }], (result) => result * sign >= 0, sign > 0 ? '>= 0' : '<= 0');
	expect(compareAngles, [{ x: 0, y: 0 }, { x: x2, y: y2 }, { x: x1, y: y1 }], (result) => result * sign <= 0, sign > 0 ? '<= 0' : '>= 0');
}
