/*
	These algorithms are based on the paper:
	Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric Predicates
	Jonathan Richard Shewchuk
	Discrete & Computational Geometry 18(3):305–363, October 1997.
*/

type f64 = number;
type u32 = number;

/** Initialize constants for splitting floating point numbers in two halves. */

function initSplit(): [f64, f64] {
	let half = true;
	let splitter: f64 = 1;
	let epsilon: f64 = 1;
	let sum: f64 = 1;
	let sumPrev: f64;

	do {
		sumPrev = sum;
		epsilon *= 0.5;

		if(half) splitter *= 2;
		half = !half;

		sum = 1 + epsilon;
	} while(sum != 1 && sum != sumPrev);

	return [splitter + 1, epsilon];
}

export const [
	/** Equals Math.round(Math.sqrt(Number.MAX_SAFE_INTEGER * 2)) + 1 */
	splitter,
	/** Equals Number.EPSILON / 2 */
	epsilon
] = initSplit();

/** Error magnitude in floating point perp dot product / 2D matrix determinant, relative to the dot product of matrix diagonals,
  * when matrix elements are inexact differences between pairs of floating point numbers. */
export const perpErrBound1 = (epsilon * 16 + 3) * epsilon;

/** Error magnitude in exact perp dot product / 2D matrix determinant, relative to the dot product of matrix diagonals,
  * when the perp dot is exact but matrix elements are inexact differences between pairs of floating point numbers. */
const perpErrBound2 = (epsilon * 12 + 2) * epsilon;

/** Error-free product of two floating point numbers.
  * See Shewchuk page 20.
  *
  * @param prodHi Low precision product.
  * @return Rounding error. */

export function twoProductLo(a: f64, b: f64, prodHi: f64): f64 {
	const a2 = a * splitter;
	const aHi = a2 - (a2 - a);
	const aLo = a - aHi;

	const b2 = b * splitter;
	const bHi = b2 - (b2 - b);
	const bLo = b - bHi;

	return aLo * bLo - (prodHi - aHi * bHi - aLo * bHi - aHi * bLo);
}

/** Error-free sum of two floating point numbers.
  * See Shewchuk page 8.
  *
  * @param sumHi Low precision sum.
  * @return Rounding error. */

export function twoSumLo(a: f64, b: f64, sumHi: f64): f64 {
	const b2 = sumHi - a;
	const a2 = sumHi - b2;

	return (a - a2) + (b - b2);
}

/** Error-free sum of two numbers and their rounding errors.
  *
  * @param sum Storage for resulting floating point expansion,
  * least significant limb first. Four elements will be written, some may be zero. */

export function twoTwoSum<Type = f64[] | Float64Array>(aHi: f64, aLo: f64, bHi: f64, bLo: f64, sum: Type): Type {
	const lolo = aLo + bLo;
	const hi1 = aHi + lolo;
	const hi1lo = twoSumLo(aHi, lolo, hi1);
	const hi2 = bHi + hi1lo;

	sum[0] = twoSumLo(aLo, bLo, lolo);
	sum[1] = twoSumLo(bHi, hi1lo, hi2);
	sum[2] = twoSumLo(hi1, hi2, hi1 + hi2);
	sum[3] = hi1 + hi2;

	return sum;
}

/** Sum two floating poing expansions and eliminate zero limbs in result.
  * @param sum Array to overwrite with resulting floating point expansion.
  * @return Length of resulting sum. */

export function bigSum(aLen: u32, aList: f64[] | Float64Array, bLen: u32, bList: f64[] | Float64Array, sum: f64[] | Float64Array): u32 {
	// Append sentinels to avoid checking end of array.
	aList[aLen] = Infinity;
	bList[bLen] = Infinity;

	let a = aList[0];
	let b = bList[0];
	let aMag = a < 0 ? -a : a;
	let bMag = b < 0 ? -b : b;
	let aPos = 1;
	let bPos = 1;
	let sumPos = 0;

	let hi = a;

	if(aMag < bMag) {
		a = aList[aPos++];
		aMag = a < 0 ? -a : a;
	} else {
		hi = b;
		b = bList[bPos++];
		bMag = b < 0 ? -b : b;
	}

	let count = aLen + bLen;

	while(--count) {
		const prev = hi;
		let next = a;

		if(aMag < bMag) {
			a = aList[aPos++];
			aMag = a < 0 ? -a : a;
		} else {
			next = b;
			b = bList[bPos++];
			bMag = b < 0 ? -b : b;
		}

		hi += next;
		const lo = twoSumLo(prev, next, hi);

		if(lo) sum[sumPos++] = lo;
	}

	if(hi) sum[sumPos++] = hi;
	return sumPos;
}

// On Chrome, plain arrays worked faster than Float64Array here.
const sum1: f64[] = []; // new Float64Array(12);
const sum2: f64[] = []; // new Float64Array(5);
const sum3: f64[] = []; // new Float64Array(9);
const sum4: f64[] = []; // new Float64Array(9);

export function crossProduct<Type = f64[] | Float64Array>(ax: f64, ay: f64, bx: f64, by: f64, result: Type): Type {
	const axbyHi = ax * by;
	const aybxHi = ay * bx;
	const axbyLo = twoProductLo(ax, by, axbyHi);
	const aybxLo = twoProductLo(ay, bx, aybxHi);

	return twoTwoSum(axbyHi, axbyLo, -aybxHi, -aybxLo, result);
}

/** Error-free sign of perp dot product / cross product magnitude / 2x2 matrix determinant.
  *
  * @return Arbitrary floating point number with sign matching the correct result, or zero if result is zero. */

export function perpDotSign(ax1: f64, ay1: f64, ax2: f64, ay2: f64, bx1: f64, by1: f64, bx2: f64, by2: f64): f64 {
	// This floating point filter is faster than going straight to arbitrary precision.
	// It can also handle large numbers so we can use Number.MAX_VALUE for sentinels
	// without overflow issues.

	const axbyHi = (ax2 - ax1) * (by2 - by1);
	const aybxHi = (ay2 - ay1) * (bx2 - bx1);
	let determinant = axbyHi - aybxHi;

	// If products of diagonals have different signs or one of them is zero,
	// then the sign of their floating point difference will be correct.
	if(axbyHi * aybxHi <= 0) return determinant;

	let detSum = axbyHi + aybxHi;
	if(detSum < 0) detSum = -detSum;

	// If determinant is larger than its error bound, its sign must be correct.
	let maxErr = detSum * perpErrBound1;
	if(determinant >= maxErr || -determinant >= maxErr) return determinant;

	// The optimized path below can be commented out to test correct handling of rarer cases.

	const axbyLo = twoProductLo(ax2 - ax1, by2 - by1, axbyHi);
	const aybxLo = twoProductLo(ay2 - ay1, bx2 - bx1, aybxHi);

	const sum = twoTwoSum(axbyHi, axbyLo, -aybxHi, -aybxLo, sum1);

	// The order of terms is important here.
	determinant = sum[0] + sum[1];
	determinant += sum[2];
	determinant += sum[3];

	// If determinant is larger than its error bound, its sign must be correct.
	maxErr = detSum * perpErrBound2;
	if(determinant >= maxErr || -determinant >= maxErr || (
		// If matrix contents were exact, then our exact determinant is also correct.
		!twoSumLo(ax2, -ax1, ax2 - ax1) &&
		!twoSumLo(ay2, -ay1, ay2 - ay1) &&
		!twoSumLo(bx2, -bx1, bx2 - bx1) &&
		!twoSumLo(by2, -by1, by2 - by1)
	)) {
		return determinant;
	}

	// One additional optimized path for a yet smaller error bound was omitted here,
	// because it occurs too rarely to get properly tested in practice.

	// The following slow calculation is only needed when native floating point
	// cannot represent coordinate differences exactly.

	const len = perpDotExact(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2, sum1);
	return len && sum1[len - 1];
}

/** @return Number of items written into the sum array (any pre-existing additional items should be ignored). */

export function perpDotExact(
	ax1: f64,
	ay1: f64,
	ax2: f64,
	ay2: f64,
	bx1: f64,
	by1: f64,
	bx2: f64,
	by2: f64,
	sum: f64[] | Float64Array
): u32 {
	crossProduct(ax2, ax2, by1, by2, sum1);
	crossProduct(ax1, ax1, by2, by1, sum2);
	const len3 = bigSum(4, sum1, 4, sum2, sum3);

	crossProduct(ay2, ay2, bx2, bx1, sum1);
	crossProduct(ay1, ay1, bx1, bx2, sum2);
	const len4 = bigSum(4, sum1, 4, sum2, sum4);

	return bigSum(len3, sum3, len4, sum4, sum);
}
