import { arrowsAlong } from "./geometry.js";
import { completedDrawingPoints, effectiveDirections, rectCorners } from "./model.js";
import { escapeHtml } from "./rich.js";

const L = () => window.L;
const SVG_NS = "http://www.w3.org/2000/svg";
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_MAX_ZOOM = 19;

let map = null;
let layers = null;
let printTiles = null;
let handlers = {};
let last = null;
let seenFocus = null;
let seenFit = null;
let rectStart = null;
let rectLast = null;
let rectPreview = null;
let hold = null;
let restoring = false;

export function setMapHandlers(next) {
  handlers = next;
}

export function getMap() {
  return map;
}

export function ensureMap() {
  if (map || !window.L) return map;
  const container = document.getElementById("map-canvas");
  if (!container) return null;

  map = L().map(container, {
    zoomControl: false,
    attributionControl: true,
    zoomSnap: 0,
    zoomDelta: 1,
  });
  L().tileLayer(OSM_TILES, {
    attribution: "&copy; OpenStreetMap",
    maxZoom: OSM_MAX_ZOOM,
    className: "map-tiles-screen",
    crossOrigin: true,
  }).addTo(map);
  L().control.zoom({ position: "topright" }).addTo(map);
  L().control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
  layers = L().layerGroup().addTo(map);

  map.on("click", (event) => handlers.onClick?.(event.latlng.lat, event.latlng.lng));
  map.on("mousedown", onRectMouseDown);
  map.on("mousemove", onRectMouseMove);
  map.on("mouseup", endRectDrag);
  window.addEventListener("mouseup", endRectDrag);
  map.on("moveend", () => {
    if (restoring) return;
    if (hold && !viewMatches(hold)) {
      restoring = true;
      map.setView([hold.lat, hold.lng], hold.zoom, { animate: false });
      restoring = false;
      return;
    }
    if (hold) return;
    const center = map.getCenter();
    handlers.onView?.(center.lat, center.lng, map.getZoom());
  });
  map.on("zoomend", () => {
    if (last) draw(last.notice, last.ui);
  });
  window.addEventListener("resize", () => map && map.invalidateSize());
  return map;
}

export function invalidateMap() {
  if (map) map.invalidateSize();
}

// Print-to-PDF keeps each tile's own pixels. A 256px tile stretched across the
// page looks soft, while the route lines stay sharp. Finer zoom tiles, drawn
// smaller, give the basemap two or four times as many pixels in the same frame.
export function printTileOptions(zoom) {
  const tileZoom = Math.round(zoom);
  const zoomOffset = Math.max(0, Math.min(2, OSM_MAX_ZOOM - tileZoom));
  return {
    url: OSM_TILES,
    tileSize: 256 / (2 ** zoomOffset),
    zoomOffset,
    maxZoom: OSM_MAX_ZOOM,
  };
}

export function prepareMapForPrint() {
  if (!map) return Promise.resolve();
  const options = printTileOptions(map.getZoom());
  restoreMapAfterPrint();
  if (!options.zoomOffset) return Promise.resolve();

  let degraded = false;
  const layer = L().tileLayer(options.url, {
    maxZoom: options.maxZoom,
    tileSize: options.tileSize,
    zoomOffset: options.zoomOffset,
    className: "map-tiles-print",
    crossOrigin: true,
    keepBuffer: 2,
  });
  printTiles = layer;
  layer.on("tileerror", (event) => {
    degraded = true;
    if (event.tile) event.tile.style.visibility = "hidden";
  });
  const ready = whenTilesLoaded(layer);
  layer.addTo(map);
  layer.bringToFront();
  return ready.then(() => {
    if (map && printTiles === layer && !degraded) {
      map.getContainer().classList.add("is-print-sharp");
    }
  });
}

export function restoreMapAfterPrint() {
  if (printTiles && map) {
    map.removeLayer(printTiles);
  }
  printTiles = null;
  map?.getContainer().classList.remove("is-print-sharp");
}

function whenTilesLoaded(layer) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      layer.off("load", finish);
      resolve();
    };
    const timer = setTimeout(finish, 8000);
    layer.on("load", finish);
  });
}

export function updateMap(notice, ui) {
  if (!ensureMap()) return;
  syncView(notice, ui);
  draw(notice, ui);
  last = { notice, ui };
  setTimeout(() => map && map.invalidateSize(), 60);
}

function syncView(notice) {
  hold = notice.map.locked
    ? { lat: notice.map.lat, lng: notice.map.lng, zoom: notice.map.zoom }
    : null;
  if (seenFocus === null) {
    seenFocus = notice.map.focusTick;
    seenFit = notice.map.fitTick;
    map.setView([notice.map.lat, notice.map.lng], notice.map.zoom, { animate: false });
    return;
  }
  if (notice.map.focusTick !== seenFocus) {
    seenFocus = notice.map.focusTick;
    if (!hold) map.setView([notice.map.lat, notice.map.lng], notice.map.zoom, { animate: false });
  }
  if (notice.map.fitTick !== seenFit) {
    seenFit = notice.map.fitTick;
    if (!hold) fitToDrawing(notice);
  }
}

function fitToDrawing(notice) {
  const points = completedDrawingPoints(notice);
  if (points.length >= 2) {
    map.fitBounds(L().latLngBounds(points.map((point) => [point.lat, point.lng])), {
      animate: false,
      maxZoom: 19,
      padding: [12, 12],
    });
  } else if (points.length === 1) {
    map.setView([points[0].lat, points[0].lng], 18, { animate: false });
  }
}

function viewMatches(view) {
  const center = map.getCenter();
  return Math.abs(map.getZoom() - view.zoom) < 1e-4
    && Math.abs(center.lat - view.lat) < 1e-6
    && Math.abs(center.lng - view.lng) < 1e-6;
}

function draw(notice, ui) {
  syncInteraction(ui, !!notice.map.locked);
  if (!layers) return;
  layers.clearLayers();
  const editing = ui.tool === "zone-rect" || ui.tool === "zone-poly";
  for (const zone of notice.map.zones || []) drawZone(zone, editing);
  if (ui.draftZone?.points?.length) {
    drawDraft(ui.draftZone, ui.zoneStyle === "hazard" ? "hazard" : "shade");
  }

  const lockedId = notice.mirrorOpposite ? notice.directions[1]?.id : null;

  for (const direction of effectiveDirections(notice)) {
    const raw = drawnLine(direction);
    if (raw.length < 2) continue;
    const line = shiftLeft(raw, 6);
    const latlngs = line.map((point) => [point.lat, point.lng]);
    L().polyline(latlngs, {
      color: "#ffffff",
      weight: 8,
      opacity: 0.92,
      interactive: false,
    }).addTo(layers);
    L().polyline(latlngs, {
      color: direction.color,
      weight: 5,
      opacity: 0.95,
      dashArray: "10 8",
      lineCap: "butt",
      interactive: false,
    }).addTo(layers);
    for (const arrow of arrowsAlong(line)) {
      L().marker([arrow.lat, arrow.lng], {
        interactive: false,
        keyboard: false,
        icon: arrowIcon(direction.color, arrow.bearing),
      }).addTo(layers);
    }
  }

  if (ui.tool === "draw") {
    const source = notice.directions.find((direction) => direction.id === ui.activeDirectionId);
    if (source && source.id !== lockedId) {
      source.points.forEach((point, index) => {
        const marker = L().marker([point.lat, point.lng], {
          draggable: true,
          bubblingMouseEvents: false,
          icon: vertexIcon(source.color),
        }).addTo(layers);
        marker.on("click", (event) => L().DomEvent.stopPropagation(event));
        marker.on("dragend", () => {
          const latlng = marker.getLatLng();
          handlers.onMovePoint?.(source.id, index, latlng.lat, latlng.lng);
        });
        marker.on("contextmenu", (event) => {
          L().DomEvent.stopPropagation(event);
          L().DomEvent.preventDefault(event);
          handlers.onDeletePoint?.(source.id, index);
        });
      });
    }
  }

  for (const note of notice.map.notes || []) drawNote(note);
  map.getContainer().style.cursor = ui.tool === "pan" ? "" : "crosshair";
}

function syncInteraction(ui, locked) {
  if (!map) return;
  const freezePan = locked || ui.tool === "zone-rect";
  setHandler(map.dragging, !freezePan);
  setHandler(map.scrollWheelZoom, !locked);
  setHandler(map.boxZoom, !locked);
  setHandler(map.keyboard, !locked);
  setHandler(map.touchZoom, !locked);
  const freezeDouble = locked || ui.tool === "zone-rect" || ui.tool === "zone-poly";
  setHandler(map.doubleClickZoom, !freezeDouble);
  const zoom = locked && hold ? hold.zoom : null;
  const minZoom = zoom ?? 0;
  const maxZoom = zoom ?? 19;
  if (Math.abs(map.getMinZoom() - minZoom) > 1e-4) map.setMinZoom(minZoom);
  if (Math.abs(map.getMaxZoom() - maxZoom) > 1e-4) map.setMaxZoom(maxZoom);
  map.getContainer().classList.toggle("is-locked", locked);
}

function setHandler(handler, enabled) {
  if (!handler) return;
  if (enabled) {
    if (!handler.enabled()) handler.enable();
  } else if (handler.enabled()) {
    handler.disable();
  }
}

function drawZone(zone, editing) {
  const ring = zoneRing(zone);
  if (ring.length < 3) return;
  const polygon = L().polygon(ring, zonePathOptions(zone.style)).addTo(layers);
  if (zone.style === "hazard") ensureHazardPattern();
  if (!editing) return;
  const handles = zone.shape === "rect" ? rectCorners(zone.points) : zone.points;
  handles.forEach((point, index) => {
    const marker = L().marker([point.lat, point.lng], {
      draggable: true,
      bubblingMouseEvents: false,
      icon: vertexIcon(zone.style === "hazard" ? "#d50000" : "#111"),
    }).addTo(layers);
    marker.on("click", (event) => L().DomEvent.stopPropagation(event));
    marker.on("drag", () => {
      polygon.setLatLngs(movedRing(zone, index, marker.getLatLng()));
    });
    marker.on("dragend", () => {
      const latlng = marker.getLatLng();
      handlers.onMoveZoneCorner?.(zone.id, index, latlng.lat, latlng.lng);
    });
    if (zone.shape === "polygon") {
      marker.on("contextmenu", (event) => {
        L().DomEvent.stopPropagation(event);
        L().DomEvent.preventDefault(event);
        handlers.onDeleteZonePoint?.(zone.id, index);
      });
    }
  });
}

function drawDraft(draft, style) {
  const points = draft.points || [];
  if (points.length >= 3) {
    L().polygon(points.map((point) => [point.lat, point.lng]), zonePathOptions(style)).addTo(layers);
    if (style === "hazard") ensureHazardPattern();
  } else if (points.length >= 2) {
    L().polyline(points.map((point) => [point.lat, point.lng]), {
      color: style === "hazard" ? "#d50000" : "#111",
      weight: 2,
      dashArray: "6 4",
      interactive: false,
    }).addTo(layers);
  }
  points.forEach((point, index) => {
    const marker = L().marker([point.lat, point.lng], {
      draggable: true,
      bubblingMouseEvents: false,
      icon: vertexIcon(style === "hazard" ? "#d50000" : "#111"),
    }).addTo(layers);
    marker.on("click", (event) => {
      L().DomEvent.stopPropagation(event);
      if (index === 0 && points.length >= 3) handlers.onFinishZone?.();
    });
    marker.on("dragend", () => {
      const latlng = marker.getLatLng();
      handlers.onMoveDraftPoint?.(index, latlng.lat, latlng.lng);
    });
    marker.on("contextmenu", (event) => {
      L().DomEvent.stopPropagation(event);
      L().DomEvent.preventDefault(event);
      handlers.onDeleteDraftPoint?.(index);
    });
  });
}

function zoneRing(zone) {
  if (zone.shape === "rect") return rectCorners(zone.points).map((point) => [point.lat, point.lng]);
  return (zone.points || []).map((point) => [point.lat, point.lng]);
}

function movedRing(zone, index, latlng) {
  if (zone.shape === "rect") {
    const corners = rectCorners(zone.points);
    const opposite = corners[(index + 2) % 4];
    return rectCorners([
      { lat: latlng.lat, lng: latlng.lng },
      { lat: opposite.lat, lng: opposite.lng },
    ]).map((point) => [point.lat, point.lng]);
  }
  return zone.points.map((point, pointIndex) => (
    pointIndex === index ? [latlng.lat, latlng.lng] : [point.lat, point.lng]
  ));
}

function zonePathOptions(style) {
  if (style === "hazard") {
    return {
      color: "#d50000",
      weight: 3,
      opacity: 1,
      fill: true,
      fillColor: "url(#nogo-hazard)",
      fillOpacity: 0.88,
      interactive: false,
    };
  }
  return {
    color: "#111",
    weight: 3,
    opacity: 1,
    fillColor: "#6e6e6e",
    fillOpacity: 0.45,
    interactive: false,
  };
}

function ensureHazardPattern() {
  const svg = map?.getPanes?.().overlayPane?.querySelector("svg");
  if (!svg) return;
  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS(SVG_NS, "defs");
    svg.insertBefore(defs, svg.firstChild);
  }
  if (defs.querySelector("#nogo-hazard")) return;
  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.setAttribute("id", "nogo-hazard");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", "12");
  pattern.setAttribute("height", "12");
  pattern.setAttribute("patternTransform", "rotate(45)");
  const red = document.createElementNS(SVG_NS, "rect");
  red.setAttribute("width", "12");
  red.setAttribute("height", "12");
  red.setAttribute("fill", "#d50000");
  const yellow = document.createElementNS(SVG_NS, "rect");
  yellow.setAttribute("width", "6");
  yellow.setAttribute("height", "12");
  yellow.setAttribute("fill", "#ffe14a");
  pattern.append(red, yellow);
  defs.append(pattern);
}

function onRectMouseDown(event) {
  if (last?.ui?.tool !== "zone-rect") return;
  if (event.originalEvent?.button !== 0) return;
  const target = event.originalEvent?.target;
  if (target instanceof Element && target.closest(".leaflet-marker-icon, .leaflet-control")) return;
  rectStart = event.latlng;
  rectLast = event.latlng;
  if (event.originalEvent) L().DomEvent.preventDefault(event.originalEvent);
}

function onRectMouseMove(event) {
  if (!rectStart) return;
  rectLast = event.latlng;
  showRectPreview(rectStart, rectLast);
}

function endRectDrag() {
  if (!rectStart || !rectLast || !map) {
    rectStart = null;
    rectLast = null;
    clearRectPreview();
    return;
  }
  const start = rectStart;
  const end = rectLast;
  rectStart = null;
  rectLast = null;
  clearRectPreview();
  const a = map.latLngToContainerPoint(start);
  const b = map.latLngToContainerPoint(end);
  if (Math.hypot(a.x - b.x, a.y - b.y) < 8) return;
  handlers.onAddZone?.([
    { lat: start.lat, lng: start.lng },
    { lat: end.lat, lng: end.lng },
  ]);
}

function showRectPreview(start, end) {
  const style = last?.ui?.zoneStyle === "hazard" ? "hazard" : "shade";
  const ring = rectCorners([
    { lat: start.lat, lng: start.lng },
    { lat: end.lat, lng: end.lng },
  ]).map((point) => [point.lat, point.lng]);
  if (!rectPreview) {
    rectPreview = L().polygon(ring, zonePathOptions(style)).addTo(map);
  } else {
    rectPreview.setStyle(zonePathOptions(style));
    rectPreview.setLatLngs(ring);
  }
  if (style === "hazard") ensureHazardPattern();
}

function clearRectPreview() {
  if (rectPreview && map) map.removeLayer(rectPreview);
  rectPreview = null;
}

function drawNote(note) {
  const anchor = L().latLng(note.lat, note.lng);
  const dot = L().marker(anchor, {
    draggable: true,
    bubblingMouseEvents: false,
    icon: L().divIcon({
      className: "plain-icon",
      html: `<div class="note-dot ${escapeHtml(note.kind)}"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    }),
  }).addTo(layers);

  const text = (note.text || "").trim();
  const hasLabel = Number.isFinite(note.labelLat) && Number.isFinite(note.labelLng);
  if (!text || !hasLabel) {
    bindDot(dot, note.id, null);
    return;
  }

  const label = L().latLng(note.labelLat, note.labelLng);
  const lines = [
    L().polyline([label, anchor], { color: "#ffffff", weight: 4, opacity: 0.95, interactive: false }),
    L().polyline([label, anchor], { color: "#111", weight: 2, opacity: 1, interactive: false }),
  ];
  for (const line of lines) line.addTo(layers);
  const bubble = L().marker(label, {
    draggable: true,
    bubblingMouseEvents: false,
    icon: bubbleIcon(note, note.kind === "work" ? 132 : 96, note.kind === "work" ? 52 : 28),
  }).addTo(layers);
  const refresh = () => placeLeader(lines, bubble, dot.getLatLng());
  bindBubble(bubble, note.id, refresh);
  bindDot(dot, note.id, refresh);
  if (!fitBubble(bubble, note)) {
    requestAnimationFrame(() => {
      if (!bubble._map) return;
      fitBubble(bubble, note);
      refresh();
    });
  }
  refresh();
}

function bindBubble(marker, id, refresh) {
  marker.on("click", (event) => L().DomEvent.stopPropagation(event));
  marker.on("drag", refresh);
  marker.on("dragend", () => {
    const latlng = marker.getLatLng();
    handlers.onMoveNoteLabel?.(id, latlng.lat, latlng.lng);
  });
}

function bindDot(marker, id, refresh) {
  marker.on("click", (event) => L().DomEvent.stopPropagation(event));
  marker.on("drag", () => refresh?.());
  marker.on("dragend", () => {
    const latlng = marker.getLatLng();
    handlers.onMoveNoteAnchor?.(id, latlng.lat, latlng.lng);
  });
}

function placeLeader(lines, bubble, anchorLatLng) {
  if (!map || !bubble?._map || !lines) return;
  const edge = bubbleEdge(bubble, anchorLatLng);
  const latlngs = [edge, anchorLatLng];
  for (const line of lines) {
    if (line._map) line.setLatLngs(latlngs);
  }
}

function bubbleEdge(bubble, anchorLatLng) {
  const el = bubble.getElement()?.querySelector(".callout, .work-flag");
  const center = map.latLngToLayerPoint(bubble.getLatLng());
  const target = map.latLngToLayerPoint(anchorLatLng);
  if (!el?.offsetWidth || !el.offsetHeight) return map.layerPointToLatLng(center);
  const halfW = el.offsetWidth / 2;
  const halfH = el.offsetHeight / 2;
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const scaleX = Math.abs(dx) < 0.01 ? Infinity : halfW / Math.abs(dx);
  const scaleY = Math.abs(dy) < 0.01 ? Infinity : halfH / Math.abs(dy);
  const t = Math.min(1, scaleX, scaleY);
  return map.layerPointToLatLng(L().point(center.x + dx * t, center.y + dy * t));
}

function fitBubble(bubble, note) {
  if (!bubble._map) return false;
  const el = bubble.getElement()?.querySelector(".callout, .work-flag");
  if (!el) return false;
  const width = Math.ceil(el.offsetWidth);
  const height = Math.ceil(el.offsetHeight);
  if (width < 2 || height < 2) return false;
  const size = bubble.options.icon?.options?.iconSize;
  if (size?.[0] === width && size?.[1] === height) return true;
  bubble.setIcon(bubbleIcon(note, width, height));
  return true;
}

function bubbleIcon(note, width, height) {
  const text = escapeHtml(note.text || "").replaceAll("\n", "<br>");
  const cls = note.kind === "work" ? "work-flag" : "callout";
  return L().divIcon({
    className: "plain-icon leaflet-div-icon",
    html: `<div class="${cls}">${text}</div>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
  });
}

function drawnLine(direction) {
  if (direction.path?.length >= 2) return direction.path;
  if (direction.points?.length >= 2) return direction.points;
  return [];
}

function shiftLeft(path, pixels) {
  if (!map || path.length < 2) return path;
  return path.map((point, index) => {
    const prev = path[Math.max(0, index - 1)];
    const next = path[Math.min(path.length - 1, index + 1)];
    const a = map.latLngToLayerPoint([prev.lat, prev.lng]);
    const b = map.latLngToLayerPoint([next.lat, next.lng]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const here = map.latLngToLayerPoint([point.lat, point.lng]);
    const shifted = map.layerPointToLatLng(L().point(
      here.x + (dy / len) * pixels,
      here.y - (dx / len) * pixels,
    ));
    return { lat: shifted.lat, lng: shifted.lng };
  });
}

function arrowIcon(color, bearingDeg) {
  return L().divIcon({
    className: "plain-icon",
    html: `<div class="arrow-rot" style="transform:rotate(${bearingDeg}deg)"><div class="arrow-head" style="--c:${color}"></div></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function vertexIcon(color) {
  return L().divIcon({
    className: "plain-icon vertex-icon",
    html: `<div class="vertex" style="--c:${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}
