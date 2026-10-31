import { bearing, haversine } from "./geometry.js";

/**
 * Draw the detour along the named streets, turning where each pair meets.
 * A point in the middle of a street is not a stop on the route, so the line
 * is not allowed to leave one named street until it reaches the next.
 */

const APPROACH_METRES = 150;
const CONTINUE_METRES = 200;
const DRIVING = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|busway)(_link)?$/;

const SUFFIX = {
  st: "street",
  street: "street",
  rd: "road",
  road: "road",
  ave: "avenue",
  av: "avenue",
  avenue: "avenue",
  cres: "crescent",
  cr: "crescent",
  crescent: "crescent",
  dr: "drive",
  drive: "drive",
  hwy: "highway",
  highway: "highway",
  tce: "terrace",
  terrace: "terrace",
  pde: "parade",
  parade: "parade",
  pl: "place",
  place: "place",
  ct: "court",
  court: "court",
  ln: "lane",
  lane: "lane",
  blvd: "boulevard",
  boulevard: "boulevard",
  cct: "circuit",
  circuit: "circuit",
  cl: "close",
  close: "close",
  gr: "grove",
  grove: "grove",
  sq: "square",
  square: "square",
  esp: "esplanade",
  esplanade: "esplanade",
};

export function normalizeStreet(value) {
  const parts = String(value || "")
    .toLowerCase()
    .replace(/[.’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!parts.length) return "";
  parts[parts.length - 1] = SUFFIX[parts[parts.length - 1]] || parts[parts.length - 1];
  return parts.join(" ");
}

/** Drop a stop number so "Stop 21 Fourth Ave" is matched as Fourth Ave. */
export function roadName(street) {
  let name = String(street || "").trim();
  name = name.replace(/^stops?\s+\d+[a-z]?\b/i, "").trim();
  name = name.replace(/^\([^)]*\)\s*/, "").trim();
  name = name.replace(/^(?:east|west|north|south)\s+side\s+/i, "").trim();
  return name;
}

export function sameStreet(a, b) {
  const left = normalizeStreet(a);
  return left.length > 0 && left === normalizeStreet(b);
}

export function nameVariants(name) {
  const variants = new Set();
  const raw = String(name || "").replace(/\s+/g, " ").trim();
  if (raw) variants.add(raw);
  const normalized = normalizeStreet(name);
  if (!normalized) return [...variants];
  const parts = normalized.split(" ");
  const last = parts[parts.length - 1];
  const stem = parts.slice(0, -1).join(" ");
  const full = stem ? `${stem} ${last}` : last;
  variants.add(titleCase(full));
  for (const [short, expanded] of Object.entries(SUFFIX)) {
    if (expanded !== last || short === last) continue;
    variants.add(titleCase(stem ? `${stem} ${short}` : short));
  }
  return [...variants];
}

export function osmElementsToWays(elements) {
  const lookup = new Map();
  for (const element of elements || []) {
    if (element?.type === "node" && Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
      lookup.set(element.id, { lat: element.lat, lng: element.lon });
    }
  }
  const ways = [];
  for (const element of elements || []) {
    const way = toWay(element, lookup);
    if (way) ways.push(way);
  }
  return ways;
}

export function routeThroughStreets({ streets, turns, ways, bias }) {
  const warnings = [];
  if (!streets || streets.length < 2) return { points: [], path: [], warnings, turns: [] };

  const graphs = streets.map((street) => buildGraph(street, ways));
  for (let index = 0; index < streets.length; index += 1) {
    if (!graphs[index].coords.size) {
      warnings.push(`Couldn't find ${streets[index]} near the area.`);
      return { points: [], path: [], warnings, turns: [] };
    }
  }

  const choices = [];
  for (let index = 0; index < streets.length - 1; index += 1) {
    const found = intersectionClusters(graphs[index], graphs[index + 1]);
    if (!found.length) {
      warnings.push(`Couldn't find where ${streets[index]} meets ${streets[index + 1]}.`);
      return { points: [], path: [], warnings, turns: [] };
    }
    found.sort((a, b) => haversine(bias, a) - haversine(bias, b));
    const cap = streets.length >= 6 ? 4 : 6;
    choices.push(found.slice(0, cap));
  }

  let best = null;
  const chosen = [];
  const visit = (index) => {
    if (index === choices.length) {
      const result = evaluate(streets, turns, graphs, chosen, bias);
      if (result && (!best || result.score < best.score)) best = result;
      return;
    }
    for (const cluster of choices[index]) {
      chosen.push(cluster);
      visit(index + 1);
      chosen.pop();
    }
  };
  visit(0);

  if (!best) {
    warnings.push("Couldn't follow those streets in order.");
    return { points: [], path: [], warnings, turns: [] };
  }

  for (const turn of best.turns) {
    if (turn.penalty < 8000) continue;
    const word = turn.requested === "U-TURN" ? "u-turn" : turn.requested.toLowerCase();
    warnings.push(`${turn.from} onto ${turn.onto} doesn't make a ${word} turn where those streets meet. The line follows the junction that is there.`);
  }

  return { points: best.points, path: best.path, warnings, turns: best.turns };
}

function evaluate(streets, turns, graphs, clusters, bias) {
  const count = streets.length;
  const fixed = new Array(count).fill(null);

  for (let index = 1; index < count - 1; index += 1) {
    const link = linkOnStreet(graphs[index], clusters[index - 1], clusters[index]);
    if (!link) return null;
    fixed[index] = link;
  }

  let approach;
  let depart;
  if (count === 2) {
    const joint = bestJoint(graphs[0], graphs[1], clusters[0], turns[0] || "STRAIGHT");
    if (!joint) return null;
    approach = joint.approach;
    depart = joint.depart;
  } else {
    const arrival = arrivalBearing(fixed[count - 2].points);
    depart = bestContinuation(graphs[count - 1], clusters[count - 2], arrival, turns[count - 2] || "STRAIGHT");
    const departure = departureBearing(fixed[1].points);
    approach = bestApproach(graphs[0], clusters[0], departure, turns[0] || "STRAIGHT");
    if (!approach || !depart) return null;
  }

  const chunks = [approach.points];
  for (let index = 1; index < count - 1; index += 1) chunks.push(fixed[index].points);
  chunks.push(depart.points);

  const path = stitch(chunks);
  if (path.length < 2) return null;

  const noted = [];
  let score = polylineLength(path) + haversine(bias, clusters[0]) * 0.35;
  score += approach.penalty + depart.penalty;
  noted.push(note(streets, 0, turns, approach.angle, approach.penalty));
  for (let index = 1; index < count - 2; index += 1) {
    const angle = between(fixed[index].points, fixed[index + 1].points);
    const penalty = turnCost(turns[index] || "STRAIGHT", angle);
    score += penalty;
    noted.push(note(streets, index, turns, angle, penalty));
  }
  if (count > 2) noted.push(note(streets, count - 2, turns, depart.angle, depart.penalty));

  for (let index = 1; index < count - 1; index += 1) {
    score += fixed[index].extra;
    if (polylineLength(fixed[index].points) < 20) score += 8000;
  }
  for (let index = 1; index < chunks.length; index += 1) {
    const gap = haversine(chunks[index - 1][chunks[index - 1].length - 1], chunks[index][0]);
    if (gap > 40) score += gap * 4;
  }

  return { score, path, points: cornerPoints(path, clusters), turns: noted };
}

function note(streets, index, turns, angle, penalty) {
  return {
    from: streets[index],
    onto: streets[index + 1],
    requested: turns[index] || "STRAIGHT",
    angle,
    penalty,
  };
}

function between(arriving, leaving) {
  const arrival = arrivalBearing(arriving);
  const departure = departureBearing(leaving);
  if (arrival == null || departure == null) return null;
  return signedTurn(arrival, departure);
}

function bestJoint(graphFrom, graphTo, cluster, requested) {
  let best = null;
  for (const nodeA of cluster.idsA) {
    if (!graphFrom.coords.has(nodeA)) continue;
    const incoming = incomingChoices(graphFrom, nodeA);
    for (const edge of incoming.edges) {
      for (const nodeB of cluster.idsB) {
        if (!graphTo.coords.has(nodeB)) continue;
        const outgoing = outgoingChoices(graphTo, nodeB);
        for (const out of outgoing.edges) {
          const arrival = bearing(graphFrom.coords.get(edge.to), graphFrom.coords.get(nodeA));
          const departure = bearing(graphTo.coords.get(nodeB), graphTo.coords.get(out.to));
          const angle = signedTurn(arrival, departure);
          const hereA = graphFrom.coords.get(nodeA);
          const hereB = graphTo.coords.get(nodeB);
          const penalty = turnCost(requested, angle)
            + haversine(hereA, hereB)
            + haversine(hereA, cluster) * 2
            + haversine(hereB, cluster) * 2;
          if (best && penalty >= best.penalty) continue;
          best = { nodeA, pred: edge.to, fromAdj: incoming.adj, nodeB, next: out.to, toAdj: outgoing.adj, angle, penalty };
        }
      }
    }
  }
  if (!best) return null;
  const approach = trace(best.fromAdj, graphFrom.coords, best.nodeA, best.pred, APPROACH_METRES);
  approach.reverse();
  return {
    approach: { points: approach, penalty: best.penalty, angle: best.angle },
    depart: {
      points: trace(best.toAdj, graphTo.coords, best.nodeB, best.next, CONTINUE_METRES),
      penalty: 0,
      angle: best.angle,
    },
  };
}

function bestApproach(graph, cluster, departure, requested) {
  let best = null;
  for (const nodeId of cluster.idsA) {
    if (!graph.coords.has(nodeId)) continue;
    const incoming = incomingChoices(graph, nodeId);
    for (const edge of incoming.edges) {
      const arrival = bearing(graph.coords.get(edge.to), graph.coords.get(nodeId));
      const angle = departure == null ? null : signedTurn(arrival, departure);
      const penalty = (departure == null ? 2500 : turnCost(requested, angle)) + haversine(graph.coords.get(nodeId), cluster) * 3;
      if (best && penalty >= best.penalty) continue;
      best = { nodeId, pred: edge.to, adj: incoming.adj, angle, penalty };
    }
  }
  if (!best) return null;
  const points = trace(best.adj, graph.coords, best.nodeId, best.pred, APPROACH_METRES);
  points.reverse();
  return { points, penalty: best.penalty, angle: best.angle };
}

function bestContinuation(graph, cluster, arrival, requested) {
  let best = null;
  for (const nodeId of cluster.idsB) {
    if (!graph.coords.has(nodeId)) continue;
    const outgoing = outgoingChoices(graph, nodeId);
    for (const edge of outgoing.edges) {
      const departure = bearing(graph.coords.get(nodeId), graph.coords.get(edge.to));
      const angle = arrival == null ? null : signedTurn(arrival, departure);
      const penalty = (arrival == null ? 2500 : turnCost(requested, angle)) + haversine(graph.coords.get(nodeId), cluster) * 3;
      if (best && penalty >= best.penalty) continue;
      best = { nodeId, next: edge.to, adj: outgoing.adj, angle, penalty };
    }
  }
  if (!best) return null;
  return {
    points: trace(best.adj, graph.coords, best.nodeId, best.next, CONTINUE_METRES),
    penalty: best.penalty,
    angle: best.angle,
  };
}

function linkOnStreet(graph, fromCluster, toCluster) {
  const starts = [...new Set(fromCluster.idsB)].filter((id) => graph.coords.has(id));
  const ends = [...new Set(toCluster.idsA)].filter((id) => graph.coords.has(id));
  let best = null;
  const consider = (path, directed) => {
    if (!path) return;
    const straight = Math.max(1, haversine(graph.coords.get(path.nodes[0]), graph.coords.get(path.nodes[path.nodes.length - 1])));
    const ratio = path.length / straight;
    const stretched = path.length > 80 && ratio > 3.2;
    const extra = (stretched ? 5000 : 0) + (directed ? 0 : 600) + Math.max(0, ratio - 1.45) * 400;
    const penalty = path.length + extra
      + haversine(graph.coords.get(path.nodes[0]), fromCluster) * 4
      + haversine(graph.coords.get(path.nodes[path.nodes.length - 1]), toCluster) * 4;
    if (best && penalty >= best.penalty) return;
    best = {
      penalty,
      extra,
      points: path.nodes.map((id) => graph.coords.get(id)),
    };
  };

  for (const start of starts) {
    for (const end of ends) {
      if (start === end) {
        consider({ length: 0, nodes: [start] }, true);
        continue;
      }
      const directed = shortest(graph.directed, start, end);
      if (directed) consider(directed, true);
      else consider(shortest(graph.undirected, start, end), false);
    }
  }
  return best;
}

function buildGraph(street, ways) {
  const coords = new Map();
  const directed = new Map();
  const undirected = new Map();

  for (const way of ways || []) {
    if (!namesOf(way).some((name) => sameStreet(name, street))) continue;
    const nodes = way.nodes || [];
    for (const node of nodes) coords.set(node.id, { lat: node.lat, lng: node.lng });
    for (let index = 0; index < nodes.length - 1; index += 1) {
      const from = nodes[index];
      const to = nodes[index + 1];
      const length = haversine(from, to);
      if (length <= 0) continue;
      addLink(undirected, from.id, to.id, length);
      addLink(undirected, to.id, from.id, length);
      const oneway = way.oneway || 0;
      if (oneway >= 0) addLink(directed, from.id, to.id, length);
      if (oneway <= 0) addLink(directed, to.id, from.id, length);
    }
  }

  bridgeGaps(directed, undirected, coords);
  const reverse = new Map();
  for (const [from, edges] of directed) {
    for (const edge of edges) addLink(reverse, edge.to, from, edge.len);
  }
  return { coords, directed, undirected, reverse };
}

function bridgeGaps(directed, undirected, coords) {
  const ends = [];
  for (const [id, edges] of undirected) {
    if (edges.length === 1) ends.push({ id, neighbor: edges[0].to });
  }
  for (let left = 0; left < ends.length; left += 1) {
    for (let right = left + 1; right < ends.length; right += 1) {
      const a = ends[left];
      const b = ends[right];
      const span = haversine(coords.get(a.id), coords.get(b.id));
      if (span < 1 || span > 55) continue;
      const intoA = bearing(coords.get(a.neighbor), coords.get(a.id));
      const towardB = bearing(coords.get(a.id), coords.get(b.id));
      if (Math.abs(signedTurn(intoA, towardB)) > 60) continue;
      const intoB = bearing(coords.get(b.neighbor), coords.get(b.id));
      const towardA = bearing(coords.get(b.id), coords.get(a.id));
      if (Math.abs(signedTurn(intoB, towardA)) > 60) continue;
      addLink(undirected, a.id, b.id, span);
      addLink(undirected, b.id, a.id, span);
      addLink(directed, a.id, b.id, span);
      addLink(directed, b.id, a.id, span);
    }
  }
}

function intersectionClusters(graphA, graphB) {
  const seeds = [];
  for (const id of graphA.coords.keys()) {
    if (!graphB.coords.has(id)) continue;
    seeds.push({ idA: id, idB: id, at: graphA.coords.get(id) });
  }
  if (!seeds.length) seeds.push(...nearestJunction(graphA, graphB, 22));
  return clusterSeeds(seeds).map((cluster) => expandCluster(cluster, graphA, graphB));
}

function expandCluster(cluster, graphA, graphB) {
  const idsA = new Set(cluster.idsA);
  const idsB = new Set(cluster.idsB);
  for (const [id, point] of graphA.coords) {
    if (haversine(point, cluster) <= 22) idsA.add(id);
  }
  for (const [id, point] of graphB.coords) {
    if (haversine(point, cluster) <= 22) idsB.add(id);
  }
  return { ...cluster, idsA: [...idsA], idsB: [...idsB] };
}

function nearestJunction(graphA, graphB, maxMetres) {
  const pairs = [];
  let closest = Infinity;
  for (const [idA, pointA] of graphA.coords) {
    for (const [idB, pointB] of graphB.coords) {
      const span = haversine(pointA, pointB);
      if (span < closest) closest = span;
      if (span > maxMetres) continue;
      pairs.push({
        idA,
        idB,
        at: { lat: (pointA.lat + pointB.lat) / 2, lng: (pointA.lng + pointB.lng) / 2 },
      });
    }
  }
  if (!pairs.length || closest > maxMetres) return [];
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const pair of pairs) {
    north = Math.max(north, pair.at.lat);
    south = Math.min(south, pair.at.lat);
    east = Math.max(east, pair.at.lng);
    west = Math.min(west, pair.at.lng);
  }
  if (haversine({ lat: south, lng: west }, { lat: north, lng: east }) > 70) return [];
  return pairs;
}

function clusterSeeds(seeds) {
  const groups = seeds.map((seed) => [seed]);
  let merged = true;
  while (merged) {
    merged = false;
    for (let left = 0; left < groups.length && !merged; left += 1) {
      for (let right = left + 1; right < groups.length; right += 1) {
        const close = groups[left].some((a) => groups[right].some((b) => haversine(a.at, b.at) <= 35));
        if (!close) continue;
        groups[left].push(...groups[right]);
        groups.splice(right, 1);
        merged = true;
        break;
      }
    }
  }
  return groups.map((group) => {
    let lat = 0;
    let lng = 0;
    const idsA = new Set();
    const idsB = new Set();
    for (const seed of group) {
      lat += seed.at.lat;
      lng += seed.at.lng;
      idsA.add(seed.idA);
      idsB.add(seed.idB);
    }
    return {
      lat: lat / group.length,
      lng: lng / group.length,
      idsA: [...idsA],
      idsB: [...idsB],
    };
  });
}

function incomingChoices(graph, nodeId) {
  const directed = graph.reverse.get(nodeId) || [];
  if (directed.length) return { adj: graph.reverse, edges: directed };
  return { adj: graph.undirected, edges: graph.undirected.get(nodeId) || [] };
}

function outgoingChoices(graph, nodeId) {
  const directed = graph.directed.get(nodeId) || [];
  if (directed.length) return { adj: graph.directed, edges: directed };
  return { adj: graph.undirected, edges: graph.undirected.get(nodeId) || [] };
}

function shortest(adj, start, goal) {
  if (start === goal) return { length: 0, nodes: [start] };
  const distance = new Map([[start, 0]]);
  const previous = new Map();
  const queue = new Set([start]);
  while (queue.size) {
    let current = null;
    let best = Infinity;
    for (const id of queue) {
      const value = distance.get(id);
      if (value < best) {
        best = value;
        current = id;
      }
    }
    queue.delete(current);
    if (current === goal) break;
    for (const edge of adj.get(current) || []) {
      const next = best + edge.len;
      if (next >= (distance.get(edge.to) ?? Infinity)) continue;
      distance.set(edge.to, next);
      previous.set(edge.to, current);
      queue.add(edge.to);
    }
  }
  if (!previous.has(goal)) return null;
  const nodes = [goal];
  let cursor = goal;
  while (cursor !== start) {
    cursor = previous.get(cursor);
    if (cursor == null) return null;
    nodes.push(cursor);
  }
  nodes.reverse();
  return { length: distance.get(goal), nodes };
}

function trace(adj, coords, startId, nextId, metres) {
  const points = [{ ...coords.get(startId) }];
  let previous = startId;
  let current = nextId;
  let left = metres;
  const seen = new Set();
  while (current != null && left > 0) {
    const from = coords.get(previous);
    const to = coords.get(current);
    if (!from || !to) break;
    const hop = `${previous}>${current}`;
    if (seen.has(hop)) break;
    seen.add(hop);
    const length = haversine(from, to);
    if (length >= left || length === 0) {
      const fraction = length === 0 ? 1 : left / length;
      points.push({
        lat: from.lat + (to.lat - from.lat) * fraction,
        lng: from.lng + (to.lng - from.lng) * fraction,
      });
      break;
    }
    points.push({ ...to });
    left -= length;
    const inbound = bearing(from, to);
    const edges = (adj.get(current) || []).filter((edge) => edge.to !== previous);
    if (!edges.length) break;
    edges.sort((a, b) => {
      const turnA = Math.abs(signedTurn(inbound, bearing(to, coords.get(a.to))));
      const turnB = Math.abs(signedTurn(inbound, bearing(to, coords.get(b.to))));
      return turnA - turnB;
    });
    previous = current;
    current = edges[0].to;
  }
  return points;
}

function arrivalBearing(points) {
  if (!points || points.length < 2) return null;
  let covered = 0;
  for (let index = points.length - 1; index > 0; index -= 1) {
    covered += haversine(points[index - 1], points[index]);
    if (covered >= 12 || index === 1) {
      if (haversine(points[index - 1], points[index]) < 0.5 && index > 1) continue;
      return bearing(points[index - 1], points[points.length - 1]);
    }
  }
  return null;
}

function departureBearing(points) {
  if (!points || points.length < 2) return null;
  let covered = 0;
  for (let index = 1; index < points.length; index += 1) {
    covered += haversine(points[index - 1], points[index]);
    if (covered >= 12 || index === points.length - 1) {
      if (haversine(points[0], points[index]) < 1) continue;
      return bearing(points[0], points[index]);
    }
  }
  return null;
}

function signedTurn(arrival, departure) {
  return ((departure - arrival + 540) % 360) - 180;
}

function turnCost(requested, angle) {
  if (angle == null || Number.isNaN(angle)) return 4000;
  const size = Math.abs(angle);
  let base = 12000;
  if (requested === "U-TURN") base = size >= 140 ? 0 : 12000;
  else if (requested === "LEFT") {
    if (angle <= -20 && angle >= -165) base = 0;
    else if (size < 45) base = 1800;
  } else if (requested === "RIGHT") {
    if (angle >= 20 && angle <= 165) base = 0;
    else if (size < 45) base = 1800;
  } else if (size <= 50) base = 0;
  else if (size <= 80) base = 1800;
  const ideal = requested === "LEFT" || requested === "RIGHT" ? 90 : requested === "U-TURN" ? 180 : 0;
  return base + Math.abs(size - ideal) * 0.8;
}

function cornerPoints(path, clusters) {
  const points = [];
  const push = (point) => {
    if (!point) return;
    const copy = { lat: point.lat, lng: point.lng };
    if (!points.length || haversine(points[points.length - 1], copy) > 12) points.push(copy);
  };
  push(path[0]);
  for (const cluster of clusters) {
    let nearest = path[0];
    let best = Infinity;
    for (const point of path) {
      const span = haversine(point, cluster);
      if (span < best) {
        best = span;
        nearest = point;
      }
    }
    push(nearest);
  }
  push(path[path.length - 1]);
  return points;
}

function stitch(chunks) {
  const path = [];
  for (const chunk of chunks) {
    for (const point of chunk) {
      if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
      if (!path.length || haversine(path[path.length - 1], point) > 0.5) path.push({ lat: point.lat, lng: point.lng });
    }
  }
  return path;
}

function polylineLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += haversine(points[index - 1], points[index]);
  return total;
}

function addLink(map, from, to, len) {
  if (from === to) return;
  if (!map.has(from)) map.set(from, []);
  const edges = map.get(from);
  if (edges.some((edge) => edge.to === to)) return;
  edges.push({ to, len });
}

function namesOf(way) {
  return [way.name, ...(String(way.alt || "").split(";"))].map((name) => name.trim()).filter(Boolean);
}

function toWay(element, lookup) {
  if (element?.type !== "way" || !element.tags?.highway) return null;
  if (!drivable(element.tags)) return null;
  const alt = [element.tags.alt_name, element.tags.loc_name, element.tags.official_name].filter(Boolean).join(";");
  if (!element.tags.name && !alt) return null;
  const ids = element.nodes || [];
  const geometry = element.geometry || [];
  const count = Math.max(ids.length, geometry.length);
  const nodes = [];
  for (let index = 0; index < count; index += 1) {
    const id = ids[index] ?? `g${element.id}:${index}`;
    const known = lookup.get(ids[index]);
    const lat = geometry[index]?.lat ?? known?.lat;
    const lng = geometry[index]?.lon ?? known?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    nodes.push({ id, lat, lng });
  }
  if (nodes.length < 2) return null;
  return {
    name: element.tags.name || "",
    alt,
    highway: element.tags.highway,
    oneway: parseOneway(element.tags.oneway),
    nodes,
  };
}

function drivable(tags) {
  if (!DRIVING.test(tags.highway || "")) {
    if (tags.highway !== "service") return false;
    if (/^(driveway|parking_aisle|alley)$/.test(tags.service || "")) return false;
  }
  return tags.area !== "yes";
}

function parseOneway(value) {
  if (value === "yes" || value === "1" || value === "true") return 1;
  if (value === "-1" || value === "reverse") return -1;
  return 0;
}

function titleCase(value) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
