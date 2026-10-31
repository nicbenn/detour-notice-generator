import { editorHtml } from "./editor.js";
import { ensureMap, getMap, setMapHandlers, updateMap } from "./mapview.js";
import {
  COLORS,
  blankNotice,
  createBlock,
  createDirection,
  createTitleLine,
  effectiveDirections,
  hydrate,
  sampleNotice,
  uid,
} from "./model.js";
import { parseDirection } from "./opposite.js";
import { renderSheet } from "./preview.js";
import { buildRoute, searchPlace, snapToRoads } from "./routing.js";
import { loadNotice, scheduleSave } from "./storage.js";

let state;
let ui;
let pendingCaret = null;
let mapSig = "";

function init() {
  const stored = loadNotice(hydrate);
  state = stored || sampleNotice();
  ui = {
    tool: "pan",
    activeDirectionId: state.directions[0]?.id ?? null,
    status: stored ? "" : "Example notice loaded. Edit it, or start a blank one.",
    busy: false,
    saveWarned: false,
  };

  document.body.addEventListener("input", onInput);
  document.body.addEventListener("change", onChange);
  document.body.addEventListener("click", onClick);
  document.body.addEventListener("dragover", onDragOver);
  document.body.addEventListener("drop", onDrop);
  window.addEventListener("paste", onPaste);
  document.getElementById("import-file").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) importNotice(file);
  });

  setMapHandlers({
    onClick: onMapClick,
    onMovePoint: movePoint,
    onDeletePoint: deletePoint,
    onMoveNote: moveNote,
    onView: onView,
  });

  window.addEventListener("beforeprint", () => {
    const map = getMap();
    if (map && state.visual === "map") map.invalidateSize();
  });

  render();
}

function render() {
  if (!state.directions.some((direction) => direction.id === ui.activeDirectionId)) {
    ui.activeDirectionId = state.directions[0]?.id ?? null;
  }
  const editor = document.getElementById("editor");
  const scroll = editor.scrollTop;
  editor.innerHTML = editorHtml(state, ui);
  editor.scrollTop = scroll;
  editor.setAttribute("aria-busy", ui.busy ? "true" : "false");
  if (pendingCaret) {
    const node = document.getElementById(pendingCaret.id);
    if (node) {
      node.focus();
      if (typeof node.setSelectionRange === "function" && pendingCaret.start != null) {
        node.setSelectionRange(pendingCaret.start, pendingCaret.end);
      }
    }
    pendingCaret = null;
  }
  renderSheet(state);
  syncMap();
  scheduleSave(state, () => {
    if (ui.saveWarned) return;
    ui.saveWarned = true;
    ui.status = "This notice is too big to autosave in the browser. Use Download to keep a copy.";
    render();
  });
}

function syncMap() {
  if (state.visual !== "map") {
    mapSig = "";
    return;
  }
  if (!window.L) {
    if (!ui.status) ui.status = "The map library didn’t load. Refresh the page once you’re online.";
    return;
  }
  ensureMap();
  const signature = JSON.stringify({
    dirs: effectiveDirections(state).map((direction) => ({
      id: direction.id,
      c: direction.color,
      p: direction.points,
      h: direction.path,
    })),
    notes: state.map.notes,
    focus: state.map.focusTick,
    fit: state.map.fitTick,
    tool: ui.tool,
    active: ui.activeDirectionId,
  });
  if (signature !== mapSig) {
    mapSig = signature;
    updateMap(state, ui);
  }
}

function onInput(event) {
  if (ui.busy) return;
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  const action = el.dataset.action;
  if (!action) return;
  if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === "text")) {
    pendingCaret = { id: el.id, start: el.selectionStart, end: el.selectionEnd };
  }
  if (ui.status.startsWith("Example notice") || ui.status.startsWith("Blank notice")) ui.status = "";
  if (!applyInput(action, el)) return;
  render();
}

function applyInput(action, el) {
  if (action === "org") state = { ...state, organisation: el.value };
  else if (action === "banner") state = { ...state, banner: el.value };
  else if (action === "title-text") updateTitle(el.dataset.id, { text: el.value });
  else if (action === "block-text") updateBlock(el.dataset.group, el.dataset.id, { text: el.value });
  else if (action === "intro") state = { ...state, directionsIntro: el.value };
  else if (action === "dir-label") updateDirection(el.dataset.id, { label: el.value });
  else if (action === "dir-detail") updateDirection(el.dataset.id, { detail: el.value });
  else if (action === "dir-color") updateDirection(el.dataset.id, { color: el.value });
  else if (action === "locality") state = { ...state, map: { ...state.map, locality: el.value } };
  else if (action === "note-text") updateNote(el.dataset.id, { text: el.value });
  else if (action === "thanks") state = { ...state, thanks: el.value };
  else if (action === "issue-date") state = { ...state, issueDate: el.value };
  else if (action === "officer") state = { ...state, officer: el.value };
  else if (action === "role") state = { ...state, role: el.value };
  else return false;
  return true;
}

function onChange(event) {
  if (ui.busy) return;
  const el = event.target;
  if (!(el instanceof HTMLInputElement)) return;
  const action = el.dataset.action;
  if (!action) return;
  if (action === "photo") {
    const file = el.files?.[0];
    if (file) readPhoto(file);
    return;
  }
  if (action === "title-hl") updateTitle(el.dataset.id, { highlight: el.checked });
  else if (action === "title-caps") state = { ...state, titleUppercase: el.checked };
  else if (action === "block-hl") updateBlock(el.dataset.group, el.dataset.id, { highlight: el.checked });
  else if (action === "block-ul") updateBlock(el.dataset.group, el.dataset.id, { underline: el.checked });
  else if (action === "block-center") updateBlock(el.dataset.group, el.dataset.id, { center: el.checked });
  else if (action === "block-bullet") updateBlock(el.dataset.group, el.dataset.id, { bullet: el.checked });
  else if (action === "thanks-blue") state = { ...state, thanksBlue: el.checked };
  else if (action === "north") state = { ...state, showNorth: el.checked };
  else return;
  render();
}

function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button || button.matches("input, textarea, select")) return;
  const action = button.dataset.action;
  if (ui.busy && action !== "print") return;

  if (action === "generate") { generate(); return; }
  if (action === "find-area") { findArea(); return; }
  if (action === "dir-snap") { snap(button.dataset.id); return; }
  if (action === "print") { printNotice(); return; }
  if (action === "blank") { replaceNotice(blankNotice(), "Blank notice."); return; }
  if (action === "example") { replaceNotice(sampleNotice(), "Example notice loaded."); return; }
  if (action === "export") { download(); return; }
  if (action === "import-pick") { document.getElementById("import-file").click(); return; }
  if (action === "visual") { state = { ...state, visual: button.dataset.value === "photo" ? "photo" : "map" }; }
  else if (action === "tool") setTool(button.dataset.value);
  else if (action === "active-dir") ui.activeDirectionId = button.dataset.id;
  else if (action === "mirror") setMirror(!state.mirrorOpposite);
  else if (action === "title-add") state = { ...state, titleLines: [...state.titleLines, createTitleLine()] };
  else if (action === "title-remove") state = { ...state, titleLines: state.titleLines.filter((line) => line.id !== button.dataset.id) };
  else if (action === "block-add") addBlock(button.dataset.group);
  else if (action === "block-remove") removeBlock(button.dataset.group, button.dataset.id);
  else if (action === "dir-add") addDirection();
  else if (action === "dir-remove") removeDirection(button.dataset.id);
  else if (action === "dir-up") moveDirection(button.dataset.id, -1);
  else if (action === "dir-down") moveDirection(button.dataset.id, 1);
  else if (action === "dir-clear") clearLine(button.dataset.id);
  else if (action === "undo-point") undoPoint(button.dataset.id);
  else if (action === "swatch") updateDirection(button.dataset.id, { color: button.dataset.color });
  else if (action === "note-remove") {
    state = { ...state, map: { ...state.map, notes: state.map.notes.filter((note) => note.id !== button.dataset.id) } };
  } else if (action === "photo-clear") state = { ...state, photo: null };
  else if (action === "fit-lines") { fitLines(); return; }
  else return;
  render();
}

function setTool(tool) {
  ui.tool = tool;
  const messages = {
    draw: "Click the map to add corners. Right-click a corner to remove it, then Snap to roads.",
    work: "Click the map to place the work area. Drag it if it needs to move.",
    closed: "Click the map where a stop is closed.",
    temp: "Click the map to place a temporary stop.",
    label: "Click the map to place a note.",
  };
  if (messages[tool]) ui.status = messages[tool];
}

function setMirror(on) {
  if (!on) {
    state = { ...state, mirrorOpposite: false, directions: effectiveDirections(state) };
    ui.status = "Direction 2 is now editable on its own.";
    return;
  }
  const directions = state.directions.length >= 2
    ? state.directions
    : [...state.directions, createDirection(COLORS[1])];
  state = { ...state, mirrorOpposite: true, directions };
  ui.status = "Direction 2 now reverses direction 1. Left and right are swapped.";
}

function addBlock(group) {
  const key = group === "before" ? "before" : "after";
  state = { ...state, [key]: [...state[key], createBlock()] };
}

function removeBlock(group, id) {
  const key = group === "before" ? "before" : "after";
  const blocks = state[key].filter((block) => block.id !== id);
  state = { ...state, [key]: blocks.length ? blocks : [createBlock()] };
}

function addDirection() {
  const direction = createDirection(COLORS[state.directions.length % COLORS.length]);
  state = { ...state, directions: [...state.directions, direction] };
  ui.activeDirectionId = direction.id;
  if (state.visual === "map") ui.tool = "draw";
  ui.status = "Direction added. Write the streets, or click the map to draw them.";
}

function removeDirection(id) {
  let notice = state;
  const index = notice.directions.findIndex((direction) => direction.id === id);
  if (notice.mirrorOpposite && index <= 1) {
    notice = { ...notice, directions: effectiveDirections(notice), mirrorOpposite: false };
  }
  let directions = notice.directions.filter((direction) => direction.id !== id);
  if (!directions.length) directions = [createDirection(COLORS[0])];
  state = { ...notice, directions, mirrorOpposite: notice.mirrorOpposite && directions.length >= 2 };
  if (ui.activeDirectionId === id) ui.activeDirectionId = state.directions[0].id;
}

function moveDirection(id, delta) {
  const index = state.directions.findIndex((direction) => direction.id === id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= state.directions.length) return;
  let directions = state.directions;
  let mirror = state.mirrorOpposite;
  if (mirror) {
    directions = effectiveDirections(state);
    mirror = false;
    ui.status = "The opposite direction was kept as text so the order could change.";
  }
  const copy = directions.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  state = { ...state, directions: copy, mirrorOpposite: mirror };
}

function clearLine(id) {
  updateDirection(id, { points: [], path: [] });
  ui.status = "That line was cleared.";
}

function undoPoint(id) {
  const direction = state.directions.find((item) => item.id === id);
  if (!direction?.points.length) return;
  const points = direction.points.slice(0, -1);
  updateDirection(id, { points, path: points });
}

function updateTitle(id, patch) {
  state = {
    ...state,
    titleLines: state.titleLines.map((line) => line.id === id ? { ...line, ...patch } : line),
  };
}

function updateBlock(group, id, patch) {
  const key = group === "before" ? "before" : "after";
  state = {
    ...state,
    [key]: state[key].map((block) => block.id === id ? { ...block, ...patch } : block),
  };
}

function updateDirection(id, patch) {
  state = {
    ...state,
    directions: state.directions.map((direction) => direction.id === id ? { ...direction, ...patch } : direction),
  };
}

function updateNote(id, patch) {
  state = {
    ...state,
    map: {
      ...state.map,
      notes: state.map.notes.map((note) => note.id === id ? { ...note, ...patch } : note),
    },
  };
}

function replaceNotice(next, message) {
  if (!window.confirm("Replace the notice you’re working on?")) return;
  const focusTick = state.map.focusTick + 1;
  state = next;
  state.map = { ...state.map, focusTick, fitTick: 0 };
  ui.activeDirectionId = state.directions[0]?.id ?? null;
  ui.tool = "pan";
  ui.status = message;
  mapSig = "";
  render();
}

async function generate() {
  if (ui.busy) return;
  const locality = state.map.locality.trim();
  if (!locality) {
    ui.status = "Type the suburb or area first, so the streets are found in the right place.";
    render();
    return;
  }
  ui.busy = true;
  ui.status = "Finding the area…";
  render();
  const warnings = [];
  try {
    try {
      const place = await searchPlace(locality);
      state = {
        ...state,
        map: { ...state.map, lat: place.lat, lng: place.lng, zoom: 15, focusTick: state.map.focusTick + 1 },
      };
    } catch (error) {
      warnings.push(error.message || "Couldn’t centre the map on that area.");
    }

    const bias = { lat: state.map.lat, lng: state.map.lng };
    const directions = state.directions.map((direction) => ({ ...direction }));
    let drew = false;
    for (let index = 0; index < directions.length; index += 1) {
      if (state.mirrorOpposite && index === 1) continue;
      const direction = directions[index];
      const name = direction.label.trim() || `Direction ${index + 1}`;
      if (!direction.detail.trim()) continue;
      const parsed = parseDirection(direction.detail);
      if (parsed.streets.length < 2) {
        if (!/normal running/i.test(direction.detail)) {
          warnings.push(`${name}: write at least two streets, like FROM Regency Road, RIGHT Young Street.`);
        }
        continue;
      }
      ui.status = `Drawing ${name}…`;
      render();
      const result = await buildRoute(parsed, bias, locality);
      directions[index] = { ...direction, points: result.points, path: result.path };
      if (result.path.length >= 2) drew = true;
      for (const warning of result.warnings) warnings.push(`${name}: ${warning}`);
      if (result.path.length < 2) warnings.push(`${name}: no line could be drawn.`);
    }

    state = {
      ...state,
      directions,
      map: { ...state.map, fitTick: drew ? state.map.fitTick + 1 : state.map.fitTick },
    };
    const lead = drew
      ? "Lines and arrows are on the notice. Drag a corner if a turn sits in the wrong place."
      : "Add streets for at least one direction, then generate again.";
    ui.status = [lead, ...warnings].filter(Boolean).join("\n");
  } catch (error) {
    ui.status = error.message || "Something went wrong while drawing the routes.";
  } finally {
    ui.busy = false;
    render();
  }
}

async function findArea() {
  if (ui.busy) return;
  const locality = state.map.locality.trim();
  if (!locality) {
    ui.status = "Type a suburb, interchange, or street to centre the map.";
    render();
    return;
  }
  ui.busy = true;
  ui.status = "Finding that place…";
  render();
  try {
    const place = await searchPlace(locality);
    state = {
      ...state,
      map: { ...state.map, lat: place.lat, lng: place.lng, zoom: 15, focusTick: state.map.focusTick + 1 },
    };
    ui.status = `Map centred on ${place.label}.`;
  } catch (error) {
    ui.status = error.message || "Couldn’t find that place.";
  } finally {
    ui.busy = false;
    render();
  }
}

async function snap(id) {
  const direction = state.directions.find((item) => item.id === id);
  if (!direction || direction.points.length < 2) {
    ui.status = "Add at least two corners on the map first.";
    render();
    return;
  }
  ui.busy = true;
  ui.status = "Following the roads…";
  render();
  try {
    const path = await snapToRoads(direction.points);
    state = {
      ...state,
      directions: state.directions.map((item) => item.id === id ? { ...item, path } : item),
      map: { ...state.map, fitTick: state.map.fitTick + 1 },
    };
    ui.status = "That line now follows the roads.";
  } catch {
    ui.status = "Couldn’t follow the roads. The straight line is still there.";
  } finally {
    ui.busy = false;
    render();
  }
}

function fitLines() {
  const points = effectiveDirections(state).some((direction) => (direction.path?.length || direction.points?.length || 0) >= 1)
    || state.map.notes.length > 0;
  if (!points) {
    ui.status = "There’s nothing on the map to zoom to yet.";
    render();
    return;
  }
  state = { ...state, map: { ...state.map, fitTick: state.map.fitTick + 1 } };
  render();
}

function onMapClick(lat, lng) {
  if (ui.busy || ui.tool === "pan" || state.visual !== "map") return;
  if (ui.tool === "draw") {
    addPoint(lat, lng);
    return;
  }
  const text = {
    work: "WORK AREA\nROAD CLOSED",
    closed: "Stop closed",
    temp: "Temporary stop",
    label: "Note",
  }[ui.tool] || "Note";
  const note = { id: uid(), kind: ui.tool, text, lat, lng };
  state = { ...state, map: { ...state.map, notes: [...state.map.notes, note] } };
  render();
}

function addPoint(lat, lng) {
  const id = ui.activeDirectionId;
  if (state.mirrorOpposite && state.directions[1]?.id === id) {
    ui.status = "That direction follows direction 1 in reverse. Draw on direction 1, or turn the opposite button off.";
    render();
    return;
  }
  const target = state.directions.find((direction) => direction.id === id) || state.directions[0];
  if (!target) return;
  updateDirection(target.id, {
    points: [...target.points, { lat, lng }],
    path: [...target.points, { lat, lng }],
  });
  ui.activeDirectionId = target.id;
  render();
}

function movePoint(id, index, lat, lng) {
  const direction = state.directions.find((item) => item.id === id);
  if (!direction) return;
  const points = direction.points.map((point, pointIndex) => pointIndex === index ? { lat, lng } : point);
  updateDirection(id, { points, path: points });
  ui.status = "Corner moved. Snap to roads if you want the line to follow the streets again.";
  render();
}

function deletePoint(id, index) {
  const direction = state.directions.find((item) => item.id === id);
  if (!direction) return;
  const points = direction.points.filter((_, pointIndex) => pointIndex !== index);
  updateDirection(id, { points, path: points });
  ui.status = "Corner removed. Snap to roads again when the corners are right.";
  render();
}

function moveNote(id, lat, lng) {
  updateNote(id, { lat, lng });
  render();
}

function onView(lat, lng, zoom) {
  if (Math.abs(state.map.lat - lat) < 1e-6 && Math.abs(state.map.lng - lng) < 1e-6 && state.map.zoom === zoom) return;
  state = { ...state, map: { ...state.map, lat, lng, zoom } };
  scheduleSave(state);
}

function readPhoto(file) {
  if (!file.type.startsWith("image/")) {
    ui.status = "Choose an image file.";
    render();
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const max = 1400;
      const scale = Math.min(1, max / image.width, max / image.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      state = { ...state, photo: canvas.toDataURL("image/jpeg", 0.9), visual: "photo" };
      ui.status = "Picture added to the notice.";
      render();
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}

function onDragOver(event) {
  if (event.target.closest?.("[data-drop-photo]")) event.preventDefault();
}

function onDrop(event) {
  if (!event.target.closest?.("[data-drop-photo]")) return;
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (file) readPhoto(file);
}

function onPaste(event) {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  const items = event.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (!item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) return;
    event.preventDefault();
    readPhoto(file);
    return;
  }
}

function download() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const title = state.titleLines.find((line) => line.text.trim())?.text || "detour-notice";
  const name = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "detour-notice";
  link.href = URL.createObjectURL(blob);
  link.download = `${name}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importNotice(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const next = hydrate(JSON.parse(String(reader.result)));
      const focusTick = state.map.focusTick + 1;
      if (!window.confirm("Replace the notice you’re working on?")) return;
      state = next;
      state.map = { ...state.map, focusTick, fitTick: 0 };
      ui.activeDirectionId = state.directions[0]?.id ?? null;
      ui.tool = "pan";
      ui.status = "Opened that notice.";
      mapSig = "";
      render();
    } catch {
      ui.status = "That file isn’t a notice this app can open.";
      render();
    }
  };
  reader.readAsText(file);
}

function printNotice() {
  const map = getMap();
  if (map && state.visual === "map") map.invalidateSize();
  setTimeout(() => window.print(), 80);
}

init();
