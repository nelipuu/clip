# clip

Clip an arbitrary complex polygon by a convex shape, in this case a circle, in O(n + k log k) time where n is the number of polygon vertices and k is the number of intersections between polygon and circle.
Robust handling of all degeneracies like edges overlapping other edges, vertices or intersections, or multiple overlapping intersections. Uses floating point coordinates and robust predicates.

Work is in progress to support rectangles in addition to circles, provide a nice API, and support spherical in addition to Euclidean geometry.

Online demo: https://nelipuu.github.io/clip/
