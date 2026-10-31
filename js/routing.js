import { haversine } from "./geometry.js";
import { nameVariants, osmElementsToWays, roadName, routeThroughStreets, sameStreet } from "./streetroute.js";

const PHOTON = "https://photon.komoot.io/api/";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM = "https://router.project-osrm.org/route/v1/driving/";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export async function searchPlace(query) {
  const photonHit = await photonPlace(query).catch(() => null);
  if (photonHit) return photonHit;
  const nominatimHit = await nominatimSearch(query, null).catch(() => null);
  if (nominatimHit) return { lat: nominatimHit.lat, lng: nominatimHit.lng, label: nominatimHit.label };
  throw new Error(`No place found for “${query}”.`);
}

/**
 * Follow the written directions from junction to junction.
 * Corners stay editable. The path is the line drawn on the notice.
 */
export async function buildRoute(direction, bias, locality) {
  const warnings = [];
  const moves = [];
  for (const move of direction?.maneuvers || []) {
    if (move.modifier || !move.street) continue;
    const street = roadName(move.street);
    if (!street) {
      warnings.push(`${move.street} doesn't name a street, so it isn't part of the line.`);
      continue;
    }
    moves.push({ ...move, street });
  }
  if (moves.length < 2) return { points: [], path: [], warnings };

  const streets = moves.map((move) => move.street);
  const turns = moves.slice(1).map((move) => move.turn || "STRAIGHT");
  try {
    const ways = await loadStreetWays(streets, bias);
    const routed = routeThroughStreets({ streets, turns, ways, bias });
    if (routed.path.length >= 2) {
      return { points: routed.points, path: routed.path, warnings: [...warnings, ...routed.warnings] };
    }
    warnings.push(...routed.warnings);
  } catch (error) {
    warnings.push(error.message || "Couldn't read the street map.");
  }

  warnings.push("Couldn't follow each street, so the line joins the middles of the streets.");
  return routeByCentres(streets, bias, locality, warnings);
}

async function routeByCentres(streets, bias, locality, warnings) {
  const points = [];
  let cursor = bias;

  for (const street of streets) {
    const hit = await geocodeStreet(street, locality, cursor);
    if (!hit) {
      warnings.push(`Couldn't find ${street} near ${locality}.`);
      continue;
    }
    const distance = haversine(cursor, hit);
    const limit = points.length === 0 ? 30000 : 8000;
    if (distance > limit) {
      warnings.push(`${street} looked too far from the others, so it was left out.`);
      continue;
    }
    if (!points.length || haversine(points[points.length - 1], hit) > 25) points.push(hit);
    cursor = hit;
  }

  if (points.length < 2) return { points, path: points, warnings };

  try {
    const path = await snapToRoads(points);
    const routed = pathLength(path);
    const direct = pathLength(points);
    if (routed > direct * 2.8 && routed - direct > 800) {
      warnings.push("The road line takes a long way around. Drag the corners if a street was matched in the wrong place.");
    }
    return { points, path, warnings };
  } catch {
    warnings.push("Couldn't follow the roads, so the line runs straight between the streets.");
    return { points, path: points, warnings };
  }
}

async function loadStreetWays(streets, bias) {
  let lastError = new Error("Couldn't read the street map.");
  for (const endpoint of OVERPASS) {
    try {
      const ways = await overpassWays(endpoint, streets, bias, 7000);
      if (!missingStreets(streets, ways).length) return ways;
      try {
        const wider = await overpassWays(endpoint, streets, bias, 14000);
        if (missingStreets(streets, wider).length <= missingStreets(streets, ways).length) return wider;
      } catch {
        // The closer extract is still usable if the wider search fails.
      }
      if (ways.length) return ways;
    } catch (error) {
      lastError = error;
    }
  }
  try {
    return await mapWays(streets, bias, 0.02);
  } catch (error) {
    throw lastError || error;
  }
}

async function overpassWays(endpoint, streets, bias, radius) {
  const data = await fetchJson(endpoint, {
    method: "POST",
    body: overpassQuery(streets, bias, radius),
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    timeout: 12000,
  });
  if (!Array.isArray(data?.elements)) throw new Error(data?.remark || "Couldn't read the street map.");
  return osmElementsToWays(data.elements);
}

function overpassQuery(streets, bias, radius) {
  const names = [...new Set(streets.flatMap((street) => nameVariants(street)))];
  const pattern = names.map(escapeRegex).join("|");
  const match = `(^|;\\s*)(${pattern})(\\s*;|$)`;
  return `[out:json][timeout:20];
(
  way["highway"]["name"~"${match}",i](around:${radius},${bias.lat},${bias.lng});
  way["highway"]["alt_name"~"${match}",i](around:${radius},${bias.lat},${bias.lng});
);
out geom;`;
}

async function mapWays(streets, bias, pad) {
  const bbox = [bias.lng - pad, bias.lat - pad, bias.lng + pad, bias.lat + pad].map((value) => value.toFixed(6)).join(",");
  const data = await fetchJson(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`, { timeout: 20000 });
  return osmElementsToWays(data.elements || []).filter((way) => streets.some((street) => wayNames(way).some((name) => sameStreet(name, street))));
}

function missingStreets(streets, ways) {
  return streets.filter((street) => !ways.some((way) => wayNames(way).some((name) => sameStreet(name, street))));
}

function wayNames(way) {
  return [way.name, ...String(way.alt || "").split(";")].map((name) => name.trim()).filter(Boolean);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function snapToRoads(points) {
  let lastError = new Error("Routing failed");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const coords = points.map((point) => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`).join(";");
      const url = `${OSRM}${coords}?overview=full&geometries=geojson`;
      const data = await fetchJson(url);
      const coordinates = data.routes?.[0]?.geometry?.coordinates;
      if (data.code !== "Ok" || !Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error(data.message || "Routing failed");
      }
      return coordinates.map(([lng, lat]) => ({ lat, lng }));
    } catch (error) {
      lastError = error;
      await sleep(350);
    }
  }
  throw lastError;
}

let lastNominatim = 0;

async function geocodeStreet(street, locality, bias) {
  // Nominatim respects the suburb in the query, so a long road is matched near the detour
  // instead of at the middle of the whole street.
  const nominatimHit = await nominatimStreet(street, locality, bias).catch(() => null);
  if (nominatimHit) return nominatimHit;
  return photonStreet(`${street}, ${locality}, Australia`, street, bias).catch(() => null);
}

async function nominatimStreet(street, locality, bias) {
  const elapsed = Date.now() - lastNominatim;
  if (elapsed < 1100) await sleep(1100 - elapsed);
  lastNominatim = Date.now();

  const url = new URL(NOMINATIM);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "au");
  url.searchParams.set("q", `${street}, ${locality}, Australia`);
  if (bias) {
    const pad = 0.08;
    url.searchParams.set("viewbox", `${bias.lng - pad},${bias.lat + pad},${bias.lng + pad},${bias.lat - pad}`);
  }
  const data = await fetchJson(url);
  if (!Array.isArray(data)) return null;
  const want = street.toLowerCase();
  const hits = data
    .map((item) => ({
      lat: Number(item.lat),
      lng: Number(item.lon),
      label: item.name || street,
      name: String(item.name || "").toLowerCase(),
      road: item.category === "highway" || item.class === "highway",
      stop: item.type === "bus_stop",
    }))
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    .filter((item) => item.name === want || item.name.startsWith(want) || String(item.label).toLowerCase().includes(want));
  const roads = hits.filter((item) => item.road && !item.stop);
  const pool = roads.length ? roads : hits.filter((item) => !item.stop);
  if (!pool.length) return null;
  pool.sort((a, b) => haversine(bias, a) - haversine(bias, b));
  if (haversine(bias, pool[0]) > 20000) return null;
  return pool[0];
}

async function photonStreet(query, street, bias) {
  const url = new URL(PHOTON);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  if (bias) {
    url.searchParams.set("lat", String(bias.lat));
    url.searchParams.set("lon", String(bias.lng));
  }
  const data = await fetchJson(url);
  const features = data.features || [];
  let best = null;
  let bestScore = 0;
  for (const feature of features) {
    const score = scoreFeature(feature, street, bias);
    if (score > bestScore) {
      best = feature;
      bestScore = score;
    }
  }
  if (!best || bestScore <= 0) return null;
  const [lng, lat] = best.geometry.coordinates;
  return { lat, lng, label: best.properties?.name || street };
}

function scoreFeature(feature, street, bias) {
  const props = feature.properties || {};
  const name = String(props.name || "").toLowerCase();
  const want = street.toLowerCase();
  let score = 0;
  if (name === want) score += 10;
  else if (name.startsWith(want)) score += 6;
  else if (want.startsWith(name) && name.length > 4) score += 4;
  else if (name.includes(want) || want.includes(name)) score += 2;
  else return 0;
  if (props.osm_key === "highway") score += 3;
  if (props.country && props.country !== "Australia" && props.countrycode !== "AU") score -= 8;
  if (bias && feature.geometry?.coordinates) {
    const [lng, lat] = feature.geometry.coordinates;
    const distance = haversine(bias, { lat, lng });
    if (distance > 30000) score -= 20;
    score -= distance / 20000;
  }
  return score;
}

async function photonPlace(query) {
  const url = new URL(PHOTON);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  const data = await fetchJson(url);
  const features = data.features || [];
  const feature = features.find((item) => item.properties?.country === "Australia" || item.properties?.countrycode === "AU") || features[0];
  if (!feature?.geometry?.coordinates) return null;
  const [lng, lat] = feature.geometry.coordinates;
  const props = feature.properties || {};
  const label = [props.name, props.city || props.state].filter(Boolean).join(", ");
  return { lat, lng, label: label || query };
}

async function nominatimSearch(query, bias) {
  const url = new URL(NOMINATIM);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "au");
  url.searchParams.set("q", query);
  if (bias) {
    const pad = 0.35;
    url.searchParams.set("viewbox", `${bias.lng - pad},${bias.lat + pad},${bias.lng + pad},${bias.lat - pad}`);
    url.searchParams.set("bounded", "0");
  }
  const data = await fetchJson(url);
  if (!Array.isArray(data) || !data.length) return null;
  const hits = data
    .map((item) => ({
      lat: Number(item.lat),
      lng: Number(item.lon),
      label: item.display_name || query,
    }))
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
  if (!hits.length) return null;
  if (!bias) return hits[0];
  hits.sort((a, b) => haversine(bias, a) - haversine(bias, b));
  return hits[0];
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 12000);
  try {
    const response = await fetch(url, {
      method: options.method,
      body: options.body,
      headers: options.headers,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Map service responded ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The map service took too long.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += haversine(points[i - 1], points[i]);
  return total;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
