import { arrowsAlong } from "./geometry.js";
import { effectiveDirections } from "./model.js";
import { escapeHtml } from "./rich.js";

const L = () => window.L;

let map = null;
let layers = null;
let handlers = {};
let last = null;
let seenFocus = null;
let seenFit = null;

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

  map = L().map(container, { zoomControl: false, attributionControl: true });
  L().tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 19,
    crossOrigin: true,
  }).addTo(map);
  L().control.zoom({ position: "topright" }).addTo(map);
  L().control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
  layers = L().layerGroup().addTo(map);

  map.on("click", (event) => handlers.onClick?.(event.latlng.lat, event.latlng.lng));
  map.on("moveend", () => {
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

export function updateMap(notice, ui) {
  if (!ensureMap()) return;
  syncView(notice);
  draw(notice, ui);
  last = { notice, ui };
  setTimeout(() => map && map.invalidateSize(), 60);
}

function syncView(notice) {
  if (seenFocus === null) {
    seenFocus = notice.map.focusTick;
    seenFit = notice.map.fitTick;
    map.setView([notice.map.lat, notice.map.lng], notice.map.zoom, { animate: false });
    return;
  }
  if (notice.map.focusTick !== seenFocus) {
    seenFocus = notice.map.focusTick;
    map.setView([notice.map.lat, notice.map.lng], notice.map.zoom, { animate: false });
  }
  if (notice.map.fitTick !== seenFit) {
    seenFit = notice.map.fitTick;
    const points = boundsPoints(notice);
    if (points.length >= 2) {
      map.fitBounds(L().latLngBounds(points.map((point) => [point.lat, point.lng])), {
        animate: false,
        maxZoom: 17,
        padding: [28, 28],
      });
    } else if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 16, { animate: false });
    }
  }
}

function boundsPoints(notice) {
  const points = [];
  for (const direction of effectiveDirections(notice)) {
    const line = drawnLine(direction);
    for (const point of line) points.push(point);
  }
  for (const note of notice.map.notes) points.push(note);
  return points;
}

function draw(notice, ui) {
  if (!layers) return;
  layers.clearLayers();
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

  for (const note of notice.map.notes) drawNote(note);
  map.getContainer().style.cursor = ui.tool === "pan" ? "" : "crosshair";
}

function drawNote(note) {
  if (note.kind === "work") {
    const marker = L().marker([note.lat, note.lng], {
      draggable: true,
      icon: L().divIcon({
        className: "plain-icon",
        html: `<div class="work-flag">${escapeHtml(note.text || "WORK AREA").replaceAll("\n", "<br>")}</div>`,
        iconSize: [138, 62],
        iconAnchor: [28, 70],
      }),
    }).addTo(layers);
    bindNote(marker, note.id);
    return;
  }

  const marker = L().marker([note.lat, note.lng], {
    draggable: true,
    icon: L().divIcon({
      className: "plain-icon",
      html: `<div class="note-dot ${note.kind}"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    }),
  }).addTo(layers);
  if (note.text.trim()) {
    marker.bindTooltip(escapeHtml(note.text).replaceAll("\n", "<br>"), {
      permanent: true,
      direction: "top",
      offset: [0, -10],
      className: "note-tip",
      opacity: 1,
    });
  }
  bindNote(marker, note.id);
}

function bindNote(marker, id) {
  marker.on("click", (event) => L().DomEvent.stopPropagation(event));
  marker.on("dragend", () => {
    const latlng = marker.getLatLng();
    handlers.onMoveNote?.(id, latlng.lat, latlng.lng);
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
