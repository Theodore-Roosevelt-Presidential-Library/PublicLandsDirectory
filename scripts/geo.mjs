// Small geometry helpers (no dependencies).
export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeom(pt, geom) {
  if (!geom) return false;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const p of polys) {
    if (pointInRing(pt, p[0]) && !p.slice(1).some((h) => pointInRing(pt, h))) return true;
  }
  return false;
}

export function bboxOverlap(a, b) {
  return a && b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function bboxOfCoords(coords) {
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (x) => { if (typeof x[0] === 'number') { a = Math.min(a, x[0]); b = Math.min(b, x[1]); c = Math.max(c, x[0]); d = Math.max(d, x[1]); } else x.forEach(walk); };
  walk(coords);
  return [a, b, c, d];
}

// Evenly sample up to n vertices from a geometry's outer rings.
export function sampleVertices(geom, n = 60) {
  const pts = [];
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const p of polys) pts.push(...p[0]);
  if (pts.length <= n) return pts;
  const step = pts.length / n;
  return Array.from({ length: n }, (_, i) => pts[Math.floor(i * step)]);
}

export function geomsIntersect(a, b) {
  // Approximate: any sampled vertex of either inside the other, or the bboxes nest.
  if (!bboxOverlap(bboxOfCoords(a.coordinates), bboxOfCoords(b.coordinates))) return false;
  return sampleVertices(a, 80).some((p) => pointInGeom(p, b)) || sampleVertices(b, 80).some((p) => pointInGeom(p, a));
}

// Shortest distance (km) from a point to any boundary edge (equirectangular approximation, fine at this scale).
export function distanceToGeomKm(p, geom) {
  const kx = Math.cos((p[1] * Math.PI) / 180) * 111.32, ky = 110.57;
  let m = Infinity;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) for (const r of poly) for (let i = 1; i < r.length; i++) {
    const ax = (r[i - 1][0] - p[0]) * kx, ay = (r[i - 1][1] - p[1]) * ky, bx = (r[i][0] - p[0]) * kx, by = (r[i][1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    m = Math.min(m, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return m;
}
