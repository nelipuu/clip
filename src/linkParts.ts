import type { XY, ClipXY, PolylinePart } from './types';
import { compareAngles } from './pseudoAtan2';
import { inPolygon } from './inPolygon';

function listIntersections(parts: PolylinePart[]) {
	const intersections: ClipXY[] = [];

	for(const { enter, exit } of parts) {
		if(enter) intersections.push(enter);
		if(exit) intersections.push(exit);
	}

	return intersections;
}

/** Smallest angle difference (from center of clipping shape) between calculated intersection coordinates,
  * that has a reliable sign considering all rounding errors in calculations.
  * Points closer together are merged. Too small values result in major topological errors with
  * regions flipping between inside vs outside. Too large values result in unnecessary point movement. */
// TODO: Somehow dependent on maximum x, y coordinates of input points and clipping shape bounds?
const ANGLE_EPSILON = 0.001;

function groupIntersections(intersections: ClipXY[]) {
	const len = intersections.length;
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
			(group.overlaps || (group.overlaps = [group])).push(pt);
			pt.group = group;
		} else {
			angle = pt.angle;
			group = pt;
		}
	}

	if(group != first && first.angle + 8 - group.angle < ANGLE_EPSILON) {
		// Merge last group into first point if it's close. Note that it may be a group already.

		if(group.overlaps) {
			for(const member of group.overlaps) {
				if(member.group) member.group = first;
			}

			if(first.overlaps) {
				first.overlaps.push.apply(first.overlaps, group.overlaps);
			} else {
				group.overlaps.push(first);
				first.overlaps = group.overlaps;
				group.overlaps = void 0;
			}
		} else {
			(first.overlaps || (first.overlaps = [first])).push(group);
		}

		group.group = first;
	}

	return intersections;
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

function sortGroups(intersections: ClipXY[], center: XY) {
	const singleMember: ClipXY[] = [];
	let lastGroup: ClipXY;

	// Sort intersecting segments around points by angle, using post-merge coordinates.
	for(const pt of intersections) {
		if(pt.group) continue;

		const overlaps = pt.overlaps || (singleMember[0] = pt, singleMember);

		for(const member of overlaps) {
			const part = member.part!;
			const ring = part.ring;

			if(part.afterLast == part.first) {
				// The segment intersects the circle a second time before / after the next point.
				let other = member.isEnter ? part.exit! : part.enter!;
				if(other.group) other = other.group;
				member.other = other;
			} else if(member.isEnter) {
				member.other = ring[part.first];
			} else {
				let last = part.afterLast - 1;
				if(last < 0) last += ring.length;
				member.other = ring[last];
			}
		}

		pt.parityCount = overlaps.length;

		// Insert placeholder for circle edge, at angle of the circle normal pointing outward.
		const outerEdge: ClipXY = {
			x: pt.x,
			y: pt.y,
			// Unused field at this point.
			angle: 0,
			group: pt,
			isEnter: true,
			other: {
				x: pt.x * 2 - center.x,
				y: pt.y * 2 - center.y
			}
		};

		overlaps.push(outerEdge);
		overlaps.sort((a, b) => compareAngles(pt!, a.other!, b.other!));

		// Construct circular bidirectional linked list.
		linkMembers(overlaps);

		// Array contents are no longer needed.
		// Restore length before previous push to re-use possible single item array.
		overlaps.pop();

		pt.outerEdge = outerEdge;
		lastGroup = pt;
	}

	return lastGroup!;
}

function linkOuterEdge(intersections: ClipXY[], parity: number, prevGroup: ClipXY) {
	for(const pt of intersections) {
		if(pt.group) continue;

		const parityChange = pt.parityCount! & 1;
		pt.count = pt.parityCount! + 2 - parityChange;

		if(parity) {
			const part: PolylinePart = {
				// Segments along circle go from entry to exit without intermediate points.
				ring: empty,
				enter: prevGroup.outerEdge!,
				exit: pt.outerEdge!,
				first: -1,
				afterLast: -1,
				isArc: true
			};

			// This is set only when processing the last intersection,
			// which was the prevGroup of the first intersection.
			const enter = pt.outerEdge!.part;

			prevGroup.outerEdge!.part = part;
			prevGroup.outerEdge!.isEnter = true;
			pt.outerEdge!.part = part;
			pt.outerEdge!.isEnter = false;

			if(!parityChange) {
				// Only with an even number of intersections in a group, we need 2 edge segments.
				const outerSecond: ClipXY = {
					x: pt.x,
					y: pt.y,
					angle: 0,
					part: enter,
					group: pt,
					isEnter: true,
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
}

const empty: ClipXY[] = [];

function draw(intersections: ClipXY[], center: XY, r: number, gc: CanvasRenderingContext2D) {
	let entryNum = 0;
	let pt = intersections[entryNum++]!;

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

		const part = pt.part;
		if(part) {
			const ring = part.ring;

			if(pt.isEnter) {
				let pos = part.first;

				while(pos != part.afterLast) {
					const pt = ring[pos];
					gc.lineTo(pt.x, pt.y);

					if(++pos >= ring.length) pos = 0;
				}

				if(part.isArc) {
					const start = Math.atan2(pt.y - center.y, pt.x - center.x);
					pt = part.exit!;
					gc.arc(center.x, center.y, r, start, Math.atan2(pt.y - center.y, pt.x - center.x));
				} else {
					pt = part.exit!;
					gc.lineTo(pt.x, pt.y);
				}
			} else {
				let pos = part.afterLast;

				while(pos != part.first) {
					if(--pos < 0) pos = ring.length - 1;

					const pt = ring[pos];
					gc.lineTo(pt.x, pt.y);
				}

				if(part.isArc) {
					const start = Math.atan2(pt.y - center.y, pt.x - center.x);
					pt = part.enter!;
					gc.arc(center.x, center.y, r, start, Math.atan2(pt.y - center.y, pt.x - center.x), true);
				} else {
					pt = part.enter!;
					gc.lineTo(pt.x, pt.y);
				}
			}
		}

		pt.visited = true;
		group = pt.group || pt;
		if(group.count) --group.count;

		pt = pt.next!;
	}

	gc.fill('evenodd');
	gc.stroke();
}

export async function linkParts(
	gc: CanvasRenderingContext2D,
	center: XY,
	r: number,
	allParts: PolylinePart[][]
) {
	console.log(center);

	const parts = allParts[0];
	const intersections = listIntersections(parts);

	const len = intersections.length;
	if(!len) return intersections;

	groupIntersections(intersections);

	const pt = intersections[0];

	linkOuterEdge(
		intersections,
		inPolygon(pt, parts, pt.y < center.y ? -1 : 1, pt.x < center.x ? 1 : -1, center) & 1,
		sortGroups(intersections, center)
	);

	draw(intersections, center, r, gc);

	// Assemble output polygons starting from unvisited entry intersections (entries). Mark visited intersections.

	return intersections;
}
