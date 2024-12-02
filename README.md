# clip

Clip an arbitrary complex polygon by a convex shape, in this case a circle, in O(n + k log k) time where n is the number of polygon vertices and k is the number of intersections between polygon and circle.
Robust handling of all degeneracies like edges overlapping other edges, vertices or intersections, or multiple overlapping intersections. Uses floating point coordinates and robust predicates.

Work is in progress to support rectangles in addition to circles, provide a nice API, and support spherical in addition to Euclidean geometry.

Online demo: https://nelipuu.github.io/clip/

## Algorithm

This is loosely based on Greiner-Hormann, but possibly novel.

Let's call the convex polygon a viewport, because the initial purpose is to extract map data visible inside a circle or rectangle.

- Loop through the complex polygon's vertices and find all intersections with the convex viewport.
  It helps that if adjacent vertices are inside, there cannot be an intersection between them.
  Store the intersection points in a list.

- Output any complex polygon rings with all vertices inside the viewport and disregard them in all following steps.

- Sort the intersection points by angle around the viewport.
  It might be possible to support a concave viewport if some other distance measure along its perimeter were used instead.

- Merge intersection points close to each other (angle difference is smaller than a chosen epsilon) along the viewport perimeter.
  This gets rid of any visibly incorrect topology resulting from floating point inaccuracies in calculating and sorting intersections.

- For each merged intersection point create a list of half edges inside the viewport.
  On each list add an additional sentinel half edge pointing outward, for example along the viewport edge normal.

- Sort listed half edges by angle, computed using the endpoint coordinates that may have moved when merging intersections.
  This should(?) be robust, so let's use J. R. Shewchuk's robust orientation predicate when angles are close.

- For each vertex build a circular linked list of the sorted half edges and also store their count.

- Choose some initial point where it's known or convenient to compute which side along the viewport edge is inside the complex polygon.
  Let's call the inside vs outside status "parity". We use Hormann-Agathos to compute winding,
  modified to consider points on the convex polygon boundary to be on the side the convex viewport boundary intersects next.

- Walk around the viewport connecting the outward sentinel half edges of adjacent intersections if the edge between is inside the complex polygon according to parity.
  At every intersection with an odd number of merged intersections, the parity flips. If there's an even number of intersections, the parity is unchanged
  so we either remove the outward pointing sentinel half edge or add another next to the existing one in the linked list for that vertex,
  so there's edges connected to both neighbors along the viewport edge.

- Optionally remove pairs of generated edges and existing edges connecting the exact same merged intersection points, if the viewport is a polygon and not for example a circle.

- Finally build the result polygon. Start from some arbitrary intersection point A and follow a half edge inside the viewport,
  along the complex polygon border to another half edge leading to an intersection point B. Mark the passed half edges as visited.

- Move to the next unvisited half edge in the sorted list around point B and repeat. If a point is reached with no more unvisited half edges (it should be the initial point A),
  then one output polygon ring is ready. Note that if a half edge is part of a generated edge representing a connection along a curved viewport edge, the connecting edge is a curve.

- If other intersection points with unvisited half edges remain, choose an arbitrary one as the new point A and start a new output polygon ring.

- When no intersection points with unvisited half edges remain, the algorithm is ready.

## References

All these have PDFs linked.

- [The point in polygon problem for arbitrary polygons](https://www.sciencedirect.com/science/article/pii/S0925772101000128). K. Hormann, A. Agathos. Computational Geometry 20(3):131-144, November 2001.
- [Efficient Clipping of Arbitrary Polygons](https://www.inf.usi.ch/hormann/papers/Greiner.1998.ECO.pdf). G. Greiner, K. Hormann. ACM Transactions on Graphics 17(2):71-83, April 1998.
- [Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric Predicates](https://link.springer.com/article/10.1007/PL00009321). J.R. Shewchuk. Discrete & Computational Geometry 18(3):305–363, October 1997.
