import { toOppositeDirections } from "./opposite.js";

export const COLORS = ["#d50000", "#1565c0", "#f15a00", "#2e7d32", "#6a1b9a", "#00838f"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10);
}

export function safeColor(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : fallback;
}

export function createDirection(color = COLORS[0]) {
  return { id: uid(), label: "", detail: "", color, points: [], path: [] };
}

export function createBlock(extra = {}) {
  return { id: uid(), text: "", highlight: false, underline: false, center: false, bullet: false, ...extra };
}

export function createTitleLine(text = "", highlight = false) {
  return { id: uid(), text, highlight };
}

export function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatIssueDate(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12) return iso;
  return `${ordinal(day)} ${MONTHS[month - 1]} ${year}`;
}

export function blankNotice() {
  return {
    version: 1,
    organisation: "Torrens Transit",
    banner: "NOTICE TO DRIVERS",
    titleUppercase: false,
    titleLines: [createTitleLine(), createTitleLine()],
    before: [createBlock()],
    directionsIntro: "",
    mirrorOpposite: false,
    directions: [createDirection(COLORS[0]), createDirection(COLORS[1])],
    after: [createBlock()],
    visual: "map",
    photo: null,
    thanks: "",
    thanksBlue: true,
    showNorth: true,
    issueDate: todayISO(),
    officer: "",
    role: "",
    map: {
      lat: -34.9285,
      lng: 138.6007,
      zoom: 12,
      locality: "",
      focusTick: 0,
      fitTick: 0,
      notes: [],
    },
  };
}

export function sampleNotice() {
  const inbound = createDirection("#f15a00");
  inbound.label = "Route 232 TO CITY –";
  inbound.detail = "FROM Regency Road, RIGHT Young Street, RIGHT Pedder Crescent and normal running. See below for missed stop. Stop 15B (East Side) Pedder Crescent and Stop 16 (North Side) Regency Road.";
  inbound.points = [
    { lat: -34.874810, lng: 138.575838 },
    { lat: -34.874832, lng: 138.577490 },
    { lat: -34.877130, lng: 138.579963 },
    { lat: -34.878298, lng: 138.579967 },
  ];
  inbound.path = [
    [138.575838, -34.874810],
    [138.576209, -34.874791],
    [138.576982, -34.874772],
    [138.577206, -34.874760],
    [138.577480, -34.874746],
    [138.577490, -34.874832],
    [138.577487, -34.874909],
    [138.577490, -34.874988],
    [138.577490, -34.875066],
    [138.577468, -34.875181],
    [138.577460, -34.875294],
    [138.577481, -34.875433],
    [138.577458, -34.875508],
    [138.577406, -34.875546],
    [138.577342, -34.875557],
    [138.576585, -34.875587],
    [138.576376, -34.875597],
    [138.576283, -34.875614],
    [138.576237, -34.875662],
    [138.576232, -34.875743],
    [138.576256, -34.876081],
    [138.576296, -34.876630],
    [138.576328, -34.876691],
    [138.576381, -34.876734],
    [138.576495, -34.876742],
    [138.577170, -34.876711],
    [138.577221, -34.876708],
    [138.577552, -34.876693],
    [138.577777, -34.876700],
    [138.577969, -34.876730],
    [138.578021, -34.876738],
    [138.578061, -34.876748],
    [138.578081, -34.876752],
    [138.578369, -34.876800],
    [138.578892, -34.876901],
    [138.578996, -34.876929],
    [138.579083, -34.876945],
    [138.579963, -34.877130],
    [138.579896, -34.877415],
    [138.579856, -34.877649],
    [138.579867, -34.877989],
    [138.579893, -34.878150],
    [138.579920, -34.878239],
    [138.579936, -34.878278],
    [138.579967, -34.878298],
  ].map(([lng, lat]) => ({ lat, lng }));

  const outbound = createDirection("#1565c0");
  outbound.label = "Route 232 TO ARNDALE INTERCHANGE –";
  outbound.detail = "FROM PEDDER CRESCENT ==NORMAL RUNNING==.";

  return {
    version: 1,
    organisation: "Torrens Transit",
    banner: "NOTICE TO DRIVERS",
    titleUppercase: false,
    titleLines: [
      createTitleLine("DETOUR for '232' BUSES (INBOUND) (UPDATED 27 APRIL 2026)"),
      createTitleLine("PEDDER CRESCENT DUDLEY PARK CLOSED"),
      createTitleLine("FROM MONDAY 12 JANUARY 2026 until FURTHER NOTICE"),
    ],
    before: [createBlock({
      text: "Due to STORMWATER UPGRADE WORK PEDDER CRESCENT Dudley Park between Regency Road and Young Street will be closed to all traffic. Buses will detour from MONDAY 12th JANUARY 2026 until FURTHER NOTICE.",
    })],
    directionsIntro: "Route 232 services **Inbound** will DETOUR as below from MONDAY 12th JANUARY 2026 until FURTHER NOTICE.",
    mirrorOpposite: false,
    directions: [inbound, outbound],
    after: [
      createBlock({
        bullet: true,
        text: "==MISSED STOPS== – 15B (East side) Pedder Crescent. Please direct passengers to the temporary stop 60 meters south of 15B (East Side) Pedder Crescent. Stop 16 (North Side) Regency Road go to stop 17 (North Side) Regency Road.",
      }),
      createBlock({
        text: "Please assist passengers as necessary. **THANK YOU** for your co-operation.",
      }),
    ],
    visual: "map",
    photo: null,
    thanks: "",
    thanksBlue: true,
    showNorth: true,
    issueDate: "2026-04-27",
    officer: "Richard Fairbrother",
    role: "Coordinator",
    map: {
      lat: -34.87655,
      lng: 138.57790,
      zoom: 16,
      locality: "Dudley Park, SA",
      focusTick: 0,
      fitTick: 0,
      notes: [
        {
          id: uid(),
          kind: "work",
          text: "PEDDER CRESCENT\nWORK AREA\nROAD CLOSED",
          lat: -34.87615,
          lng: 138.5786,
        },
        {
          id: uid(),
          kind: "closed",
          text: "Stops 15B (east side)\nPedder Crescent\nClosed",
          lat: -34.87672,
          lng: 138.57905,
        },
        {
          id: uid(),
          kind: "temp",
          text: "Temporary\nStop (East side)",
          lat: -34.87695,
          lng: 138.57985,
        },
      ],
    },
  };
}

export function effectiveDirections(notice) {
  const directions = notice.directions || [];
  if (!notice.mirrorOpposite || directions.length < 2) return directions;
  const [first, second, ...rest] = directions;
  const line = first.path?.length ? first.path : first.points || [];
  return [
    first,
    {
      ...second,
      detail: toOppositeDirections(first.detail || ""),
      points: [...(first.points || [])].reverse(),
      path: [...line].reverse(),
    },
    ...rest,
  ];
}

export function hydrate(raw) {
  const base = blankNotice();
  if (!raw || typeof raw !== "object") return base;

  const titleLines = Array.isArray(raw.titleLines)
    ? raw.titleLines.filter((line) => line && typeof line === "object").map((line) => ({
      id: line.id || uid(),
      text: String(line.text || ""),
      highlight: !!line.highlight,
    }))
    : null;

  const directions = Array.isArray(raw.directions)
    ? raw.directions.map((direction, index) => asDirection(direction, COLORS[index % COLORS.length])).filter(Boolean)
    : [];

  return {
    version: 1,
    organisation: String(raw.organisation ?? base.organisation),
    banner: String(raw.banner ?? base.banner),
    titleUppercase: !!raw.titleUppercase,
    titleLines: titleLines || base.titleLines,
    before: asBlocks(raw.before, base.before),
    directionsIntro: String(raw.directionsIntro || ""),
    mirrorOpposite: !!raw.mirrorOpposite && (directions.length >= 2),
    directions: directions.length ? directions : base.directions,
    after: asBlocks(raw.after, base.after),
    visual: raw.visual === "photo" ? "photo" : "map",
    photo: typeof raw.photo === "string" ? raw.photo : null,
    thanks: String(raw.thanks || ""),
    thanksBlue: raw.thanksBlue !== false,
    showNorth: raw.showNorth !== false,
    issueDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.issueDate || "") ? raw.issueDate : base.issueDate,
    officer: String(raw.officer || ""),
    role: String(raw.role || ""),
    map: {
      lat: finite(raw.map?.lat, base.map.lat),
      lng: finite(raw.map?.lng, base.map.lng),
      zoom: finite(raw.map?.zoom, base.map.zoom),
      locality: String(raw.map?.locality || ""),
      focusTick: 0,
      fitTick: 0,
      notes: Array.isArray(raw.map?.notes) ? raw.map.notes.map(asNote).filter(Boolean) : [],
    },
  };
}

function asBlocks(list, fallback) {
  if (!Array.isArray(list)) return fallback;
  const blocks = list.map(asBlock).filter(Boolean);
  return blocks.length ? blocks : fallback;
}

function asBlock(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: raw.id || uid(),
    text: String(raw.text || ""),
    highlight: !!raw.highlight,
    underline: !!raw.underline,
    center: !!raw.center,
    bullet: !!raw.bullet,
  };
}

function asDirection(raw, fallbackColor) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: raw.id || uid(),
    label: String(raw.label || ""),
    detail: String(raw.detail || ""),
    color: safeColor(raw.color, fallbackColor),
    points: asPoints(raw.points),
    path: asPoints(raw.path),
  };
}

function asPoints(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((point) => ({ lat: Number(point?.lat), lng: Number(point?.lng) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function asNote(raw) {
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const kinds = ["work", "closed", "temp", "label"];
  return {
    id: raw.id || uid(),
    kind: kinds.includes(raw.kind) ? raw.kind : "label",
    text: String(raw.text || ""),
    lat,
    lng,
  };
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function ordinal(day) {
  const teen = day % 100;
  if (teen >= 11 && teen <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}
