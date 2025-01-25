import type { XY, ClipXY, PolylinePart } from './types';
import { pseudoAtan2 } from './pseudoAtan2';

/** Compute intersections between a circle and polyline.
  *
  * @param center Circle center.
  * @param r Circle radius.
  * @param ring List of polyline points.
  * @param parts Overwritten with list of remaining polyline parts after intersecting.
  * @return Number of generated parts. */

export function clipCircle(
	center: XY,
	r: number,
	rings: XY[][],
	closed: boolean,
	allParts: PolylinePart[][]
): number {
	const r2 = r * r;
	let partCount = 0;

	for(const ring of rings) {
		const len = ring.length;
		if(len < 2) continue;

		const parts: PolylinePart[] = [];
		allParts.push(parts);

		let pos = closed ? len - 1 : 0;
		/** Two lowest bits signal whether two latest points were inside the circle.
		  * Initial special value 4 means two points haven't been processed yet. */
		let inside = 4;
		// Not accessed on first iteration due to special initial inside flag.
		let pt = ring[0];

		const firstPart: PolylinePart = { ring, first: 0, afterLast: -1 };
		let part = firstPart;

		for(let next = +!closed; pos < len; pos = next++) {
			const prevPos = pos;
			const prev = pt;

			pt = ring[pos];
			const cx = pt.x - center.x;
			const cy = pt.y - center.y;
			const sqDist = cx * cx + cy * cy;

			// Keep inside flags of two latest points, mask away third bit to drop it.
			// Keep fourth bit with initial flag about a missing second point, for one iteration.
			inside = +(sqDist < r2) + (inside << 1) & 0b1011;

			// Check if we have two points and at least one is outside the circle.
			if(inside < 3) {
				const dx = prev.x - pt.x;
				const dy = prev.y - pt.y;
				const d = dx * dx + dy * dy;
				const area = dx * cy - dy * cx;
				const discriminant = r2 * d - area * area;

				// No intersections if segment is too far from circle center.
				if(discriminant >= 0) {
					const dot = dx * cx + dy * cy;
					const delta = Math.sqrt(discriminant);
					let enter: ClipXY | undefined;
					let t: number;

					if(!(inside & 2)) {
						// If previous point was outside, a new polyline part would enter the circle here.
						t = (dot - delta) / d;

						// If the current point is inside, there's definitely an intersection on the line segment.
						// Otherwise check its bounds.
						if((inside & 1) || (t >= -1 && t <= 0)) {
							const x = t * dx;
							const y = t * dy;

							part = { ring, first: pos, afterLast: -1 };
							enter = {
								x: pt.x - x,
								y: pt.y - y,
								angle: pseudoAtan2(cy - y, cx - x),
								isEnter: true,
								part
							};

							part.enter = enter;
							parts[partCount++] = part;
						}
					}

					if(!(inside & 1)) {
						// If current point is outside, the current polyline part would exit the circle here.
						let u = (dot + delta) / d;

						// If the previous point is inside, there's definitely an intersection on the line segment.
						// Otherwise if there was one, there's another.
						if((inside & 2) || enter) {
							if(!(inside & 2)) {
								// The other intersection may be off the line segment, if the found intersection was at an endpoint.
								// If we still consider it to have entered, we need to add a corresponding exit point on the segment anyway.
								if(u < -1) u = -1;
								if(u > 0) u = 0;
							}

							const x = u * dx;
							const y = u * dy;

							const exit: ClipXY = {
								x: pt.x - x,
								y: pt.y - y,
								angle: pseudoAtan2(cy - y, cx - x),
								isEnter: false,
								part
							};

							part.exit = exit;
							part.afterLast = pos;
							if(!closed && part == firstPart) parts[partCount++] = part;
						}
					}
				}
			}
		}

		if(part == firstPart) {
			if(inside & 3) {
				part.afterLast = len;
				parts[partCount++] = part;
			}
		} else if(closed && firstPart.exit) {
			part.exit = firstPart.exit;
			part.afterLast = firstPart.afterLast;
			part.exit.part = part;
		}
	}

	return partCount;
}
