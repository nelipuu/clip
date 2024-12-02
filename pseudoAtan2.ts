import type { XY } from './types';
import { perpDotSign } from './orient';

/** Compute a pseudo-angle suitable for sorting vectors by angle.
  *
  * @return Angle between -4 and 4. If multiplied by PI / 4,
  * absolute difference from Math.atan2() result should be less than
  * 0.071114637602452 or less than about 4.075 degrees.
  * The error is greatest at angles near n * 90 +- 27.59711 degrees,
  * for example inputs:
  * (-0.20780714697628988, -0.10862561486260902) or
  * ( 0.33611321538438643, -0.17569417505503448) */

export function pseudoAtan2(y: number, x: number) {
	const d = +(x < -y);
	return (+(x > y) ^ d ? y / x : y && 2 - x / y) - (d << 2) + ((d & +(y >= 0)) << 3);
}

/** Error-free comparison of angles, for sorting points around pt. */

export function compareAngles(pt: XY, a: XY, b: XY) {
	return (+(a.x > pt.x) * 3 ^ +(a.y > pt.y)) - (+(b.x > pt.x) * 3 ^ +(b.y > pt.y)) || perpDotSign(pt.x, pt.y, a.x, a.y, pt.x, pt.y, b.x, b.y);
}
