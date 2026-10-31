const EARTH_METRES = 6371000;

export function haversine(a, b) {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δφ = toRad(b.lat - a.lat);
  const Δλ = toRad(b.lng - a.lng);
  const sin = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_METRES * Math.asin(Math.min(1, Math.sqrt(sin)));
}

/** Degrees clockwise from north. */
export function bearing(a, b) {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Arrow anchors along a line. Short lines get one arrow in the middle.
 * Long lines are capped so a highway detour doesn't become a solid row of heads.
 */
export function arrowsAlong(path, spacingMetres = 140) {
  if (!path || path.length < 2) return [];
  const segments = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const len = haversine(path[i], path[i + 1]);
    if (len <= 0) continue;
    segments.push({ a: path[i], b: path[i + 1], len });
    total += len;
  }
  if (!segments.length || total < 20) return [];

  let step = spacingMetres;
  if (total / step > 10) step = total / 10;
  if (total < step * 1.6) return [pointAlong(segments, total / 2)];

  const arrows = [];
  let target = step * 0.7;
  let walked = 0;
  for (const segment of segments) {
    while (target <= walked + segment.len && target < total - 12) {
      const t = (target - walked) / segment.len;
      arrows.push({
        lat: segment.a.lat + (segment.b.lat - segment.a.lat) * t,
        lng: segment.a.lng + (segment.b.lng - segment.a.lng) * t,
        bearing: bearing(segment.a, segment.b),
      });
      target += step;
    }
    walked += segment.len;
  }
  return arrows.length ? arrows : [pointAlong(segments, total / 2)];
}

function pointAlong(segments, distance) {
  let walked = 0;
  for (const segment of segments) {
    if (walked + segment.len >= distance) {
      const t = (distance - walked) / segment.len;
      return {
        lat: segment.a.lat + (segment.b.lat - segment.a.lat) * t,
        lng: segment.a.lng + (segment.b.lng - segment.a.lng) * t,
        bearing: bearing(segment.a, segment.b),
      };
    }
    walked += segment.len;
  }
  const last = segments[segments.length - 1];
  return {
    lat: last.b.lat,
    lng: last.b.lng,
    bearing: bearing(last.a, last.b),
  };
}

function toRad(degrees) {
  return degrees * Math.PI / 180;
}
