import type { XY } from './types';
import { compareAngles, pseudoAtan2 } from './pseudoAtan2';
import { inPolygon } from './inPolygon';

interface ClipXY extends XY {
	/** Angle approximating atan2(this.y - center.y, this.x - center.x), for sorting */
	angle: number;

	// NOTE: These two shouldn't be set simultaneously.
	/** Polyline part that enters at this point. */
	enter?: PolylinePart;
	/** Polyline part that exits at this point. */
	exit?: PolylinePart;

	/** Merged intersections (including this one) that enter at this point. */
	enterList?: ClipXY[];
	/** Merged intersections (including this one) that exit at this point. */
	exitList?: ClipXY[];

	prev?: ClipXY;
	next?: ClipXY;
	group?: ClipXY;

	outerEdge?: ClipXY;

	/** The inner end of a line segment entering or exiting at this point. */
	other?: XY;

	parityCount?: number;
	count?: number;

	visited?: boolean;
}

export interface PolylinePart {
	/** Reference to original ring, unchanged. */
	ring: XY[];

	/** Index of first point along original ring. */
	first: number;
	/** Index of one past last point along original ring. */
	afterLast: number;

	/** New point before first, clipped to edge. */
	enter?: ClipXY;
	/** New point after last, clipped to edge. */
	exit?: ClipXY;

	isArc?: boolean;
}

/** Compute intersections between a circle and polyline.
  *
  * @param center Circle center.
  * @param r Circle radius.
  * @param ring List of polyline points.
  * @param parts Overwritten with list of remaining polyline parts after intersecting.
  * @return Number of generated parts. */

export function intersectCirclePolyline(
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

		for(const pt of ring) {
			const cx = pt.x - center.x;
			const cy = pt.y - center.y;
			const sqDist = cx * cx + cy * cy;
		}

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
								enter: part
							};

							if(enter.x < 120) debugger;
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
								exit: part
							};

							if(exit.x < 120) debugger;
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
			part.exit.exit = part;
		}
	}

	return partCount;
}

/** Add links between members of an array of intersections,
  * turning it into a circular, bidirectional linked list. */
function linkMembers(intersections: ClipXY[]) {
	const len = intersections.length;
	let pos = len - 1;

	for(let next = 0; next < len; pos = next++) {
		intersections[pos].next = intersections[next];
		intersections[next].prev = intersections[pos];
	}
}

const ANGLE_EPSILON = 0.001;
const empty: ClipXY[] = [];

export async function linkIntersections(
	gc: CanvasRenderingContext2D,
	center: XY,
	r: number,
	allParts: PolylinePart[][]
) {
	console.log(center);
	const intersections: ClipXY[] = [];
	const parts = allParts[0];

	for(const { enter, exit } of parts) {
		if(enter) intersections.push(enter);
		if(exit) intersections.push(exit);
	}

	const len = intersections.length;
	if(!len) return;

	// If we replace angle with some other arbitrary monotonously increasing distance along clipping shape edge, maybe it wouldn't even need to be convex?
	intersections.sort((a, b) => a.angle - b.angle);

	const first = intersections[0];
	let group = first;
	let angle = group.angle;

	// Merge intersections close to each other, in case comparing their angles produces
	// incorrect ordering relative to correct topology, due to coordinate inaccuracy.
	for(let pos = 1; pos < len;) {
		const pt = intersections[pos++];

		if(pt.angle - angle < ANGLE_EPSILON) {
			if(pt.enter) (group.enterList || (group.enterList = (group.enter ? [group] : []))).push(pt);
			if(pt.exit) (group.exitList || (group.exitList = (group.exit ? [group] : []))).push(pt);
			pt.group = group;
		} else {
			angle = pt.angle;
			group = pt;
		}
	}

	if(group != first && first.angle + 8 - group.angle < ANGLE_EPSILON) {
		// Merge last group into first point if it's close. Note that it may be a group already.

		if(group.enterList) {
			for(const member of group.enterList) {
				if(member.group) member.group = first;
			}

			if(first.enterList) {
				[].push.apply(first.enterList, group.enterList);
			} else {
				if(first.enter) group.enterList.push(first);
				first.enterList = group.enterList;
				group.enterList = void 0;
			}
		} else if(group.enter) {
			if(first.enterList) {
				first.enterList.push(group);
			} else {
				first.enterList = [group];
				if(first.enter) first.enterList.push(first);
			}
		}

		if(group.exitList) {
			for(const member of group.exitList) {
				if(member.group) member.group = first;
			}

			if(first.exitList) {
				[].push.apply(first.exitList, group.exitList);
			} else {
				if(first.exit) group.exitList.push(first);
				first.exitList = group.exitList;
				group.exitList = void 0;
			}
		} else if(group.exit) {
			if(first.exitList) {
				first.exitList.push(group);
			} else {
				first.exitList = [group];
				if(first.exit) first.exitList.push(first);
			}
		}

		group.group = first;
	}

	const singleEnter: ClipXY[] = [];
	const singleExit: ClipXY[] = [];
	let lastGroup: ClipXY;

	// Sort intersecting segments around points by angle, using post-merge coordinates.
	for(const pt of intersections) {
		if(pt.group) continue;

		const enterList = pt.enterList || (pt.enter ? (singleEnter[0] = pt, singleEnter) : empty);
		const exitList = pt.exitList || (pt.exit ? (singleExit[0] = pt, singleExit) : empty);

		for(const member of enterList) {
			const part = member.enter!;
			const ring = part.ring;

			if(part.afterLast == part.first) {
				// The segment intersects the circle a second time before the next point.
				let other = part.exit!;
				if(other.group) other = other.group;
				member.other = other;
			} else {
				member.other = ring[part.first];
			}
		}

		for(const member of exitList) {
			const part = member.exit!;
			const ring = part.ring;

			if(part.afterLast == part.first) {
				// The segment intersects the circle a second time after the previous point.
				let other = part.enter!;
				if(other.group) other = other.group;
				member.other = other;
			} else {
				let last = part.afterLast - 1;
				if(last < 0) last += ring.length;
				member.other = ring[last];
			}
		}

		const segmentList = enterList.concat(exitList);
		pt.parityCount = segmentList.length;

		// Insert placeholder for circle edge, at angle of the circle normal pointing outward.
		const outerEdge: ClipXY = {
			x: pt.x,
			y: pt.y,
			// Unused field at this point.
			angle: 0,
			group: pt,
			other: {
				x: pt.x * 2 - center.x,
				y: pt.y * 2 - center.y
			}
		};

		segmentList.push(outerEdge);
		segmentList.sort((a, b) => compareAngles(pt!, a.other!, b.other!));

		// Construct circular bidirectional linked list.
		linkMembers(segmentList);

		pt.outerEdge = outerEdge;
		lastGroup = pt;
	}

	// Segments along circle go from entry to exit without intermediate points.
	const clipRing = empty;

	let pt = intersections[0];
	let parity: number | null = null;

	for(let i = 1; i < intersections.length; ++i) {
		if(!intersections[i].group) {
			parity = inPolygon(pt, parts, pt.y < center.y ? -1 : 1, pt.x < center.x ? 1 : -1, center);
			break;
		}
	}

	if(parity === null) return intersections;
	parity = parity & 1;

	let prevGroup = lastGroup!;

	for(const pt of intersections) {
		if(pt.group) continue;

		const parityChange = pt.parityCount! & 1;
		pt.count = pt.parityCount! + 2 - parityChange;

		if(parity) {
			const part: PolylinePart = {
				ring: clipRing,
				enter: prevGroup.outerEdge!,
				exit: pt.outerEdge!,
				first: -1,
				afterLast: -1,
				isArc: true
			};

			// This is set only when processing the last intersection,
			// which was the prevGroup of the first intersection.
			const enter = pt.outerEdge!.enter;

			prevGroup.outerEdge!.enter = part;
			pt.outerEdge!.exit = part;

			if(!parityChange) {
				// Ensure this is unset.
				pt.outerEdge!.enter = void 0;

				// Only with an even number of intersections in a group, we need 2 edge segments.
				const outerSecond: ClipXY = {
					x: pt.x,
					y: pt.y,
					angle: 0,
					enter,
					group: pt,
					prev: pt.outerEdge!.prev,
					next: pt.outerEdge!,
					other: pt.outerEdge!.other,
				};

				// Prepare to add next segment before current one in sorted list.
				outerSecond.prev!.next = outerSecond;
				outerSecond.next!.prev = outerSecond;
				pt.outerEdge = outerSecond;
			}
		}

		parity ^= parityChange;
		prevGroup = pt;
	}

	// Assemble output polygons starting from unvisited entry intersections (entries). Mark visited intersections.

	let entryNum = 0;
	pt = intersections[entryNum++]!;
	if(!pt) return intersections;

	gc.beginPath();
	gc.moveTo(pt.x, pt.y);

	while(1) {
		if(
			!pt ||
			(pt.group || pt).count == 0 ||
			(!pt.group && !pt.count && pt.visited)
		) {
			// A ring is complete, switch to next one.
			while((!pt || pt.visited) && entryNum < intersections.length) pt = intersections[entryNum++];

			if(pt.visited) break;
			gc.moveTo(pt.x, pt.y);
		} else {
			while(pt.visited) pt = pt.next!;
		}

		pt.visited = true;
		let group = pt.group || pt;
		if(group.count) --group.count;

		const enter = pt.enter;
		const exit = pt.exit;

		if(enter) {
			const ring = enter.ring;
			let pos = enter.first;

			while(pos != enter.afterLast) {
				const pt = ring[pos];
				gc.lineTo(pt.x, pt.y);

				if(++pos >= ring.length) pos = 0;
			}

			if(enter.isArc) {
				const start = Math.atan2(pt.y - center.y, pt.x - center.x);
				pt = enter.exit!;
				gc.arc(center.x, center.y, r, start, Math.atan2(pt.y - center.y, pt.x - center.x));
			} else {
				pt = enter.exit!;
				gc.lineTo(pt.x, pt.y);
			}
		} else if(exit) {
			const ring = exit.ring;
			let pos = exit.afterLast;

			while(pos != exit.first) {
				if(--pos < 0) pos = ring.length - 1;

				const pt = ring[pos];
				gc.lineTo(pt.x, pt.y);
			}

			if(exit.isArc) {
				const start = Math.atan2(pt.y - center.y, pt.x - center.x);
				pt = exit.enter!;
				gc.arc(center.x, center.y, r, start, Math.atan2(pt.y - center.y, pt.x - center.x), true);
			} else {
				pt = exit.enter!;
				gc.lineTo(pt.x, pt.y);
			}
		}

		pt.visited = true;
		group = pt.group || pt;
		if(group.count) --group.count;

		if(!pt.next) {
			if(pt.group && pt.group.group) console.log('IMPOSSIBLE!!!');
			debugger;
		}
		pt = pt.next!;
	}

	gc.fill('evenodd');
	gc.stroke();

	return intersections;
}
