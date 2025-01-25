export interface XY {
	x: number;
	y: number;
}

export interface ClipXY extends XY {
	/** Angle approximating atan2(this.y - center.y, this.x - center.x), for sorting */
	angle: number;

	isEnter: boolean;
	part?: PolylinePart;

	/** Merged intersections (including this one) at this point. */
	overlaps?: ClipXY[];

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
