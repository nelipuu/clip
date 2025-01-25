import type { XY, PolylinePart } from './types';
import { perpDotSign } from './orient';

const enum PartState {
	outside,
	entering,
	inside,
	exiting,
	none
}

export function inPolygon(r: XY, parts: PolylinePart[], ex: number, ey: number, center: XY) {
	const partCount = parts.length;

	// Start from last part in case first point is inside it.
	let partNum = -1;
	let part = parts[partNum + partCount];
	let state = PartState.inside;

	const ring = part.ring;
	const len = ring.length;
	let pos = -1;
	let p = ring[len - 1];
	let p1 = ring[0];
	let winding = 0;

	if(part.afterLast >= part.first) {
		// If first point is not inside last part, start from first part.
		partNum = 0;
		part = parts[partNum];
		state = PartState.outside;
	}

	while(1) {
		switch(state) {
			case PartState.outside:
				++pos;
				if(pos == part.first) {
					state = PartState.entering;
					const enter = part.enter!;
					p1 = enter.group || enter;
				} else p1 = ring[pos];
				break;

			case PartState.entering:
				if(pos == part.afterLast) {
					state = PartState.exiting;
					const exit = part.exit!;
					p1 = exit.group || exit;
				} else {
					state = PartState.inside;
					p1 = ring[pos];
				}
				break;

			case PartState.inside:
				++pos;
				if(pos == part.afterLast) {
					state = PartState.exiting;
					const exit = part.exit!;
					p1 = exit.group || exit;
				} else p1 = ring[pos];
				break;

			case PartState.exiting:
				if(++partNum < partCount) {
					part = parts[partNum];
					state = PartState.outside;
				} else state = PartState.none;
				p1 = ring[pos];
				break;

			default:
				p1 = ring[++pos];
		}

		if(pos >= len) break;

		const rx = r.x;
		const ry = r.y;

		const dx = p.x - rx || -ex;
		const dx1 = p1.x - rx || -ex;

		if(((p.y - ry || -ey) < 0) != ((p1.y - ry || -ey) < 0) && (dx >= 0 || dx1 > 0)) {
			if(dx >= 0 && dx1 > 0) {
				winding += p1.y > p.y ? 1 : -1;
			} else {
				// Check which side of polygon edge segment the point lies on.
				// If it's on the segment, compare angle between segment and clipping shape
				// tangent at the point, to know whether following along the clipping shape
				// immediately leads inside or outside.
				const side = (
					perpDotSign(rx, ry, p.x, p.y, rx, ry, p1.x, p1.y) ||
					// Compare with tangent by flipping x/y in direction to center.
					perpDotSign(p1.x, p1.y, p.x, p.y, -center.y, center.x, -ry, rx)
				);

				if(side && side > 0 == (p1.y > p.y)) winding += p1.y > p.y ? 1 : -1;
			}
		}

		p = p1;
	}

	return winding;
}
