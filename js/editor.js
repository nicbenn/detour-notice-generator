import { extractStreets } from "./opposite.js";
import { effectiveDirections, safeColor } from "./model.js";
import { escapeHtml } from "./rich.js";

const SWATCHES = ["#d50000", "#1565c0", "#f15a00", "#2e7d32"];

export function editorHtml(notice, ui) {
  const shown = effectiveDirections(notice);
  return `
    <div class="status-wrap">
      ${ui.status ? `<p class="status" role="status">${escapeHtml(ui.status)}</p>` : ""}
    </div>

    <section class="section">
      <h2><span>1</span> Notice</h2>
      <div class="stack">
        ${field("Organisation", `<input id="org" type="text" data-action="org" value="${escapeHtml(notice.organisation)}" autocomplete="off">`)}
        ${field("Banner", `<input id="banner" type="text" data-action="banner" value="${escapeHtml(notice.banner)}" autocomplete="off">`)}
        <div>
          <p class="label">Title</p>
          ${notice.titleLines.map((line) => `
            <div class="line-row">
              <input id="title-${line.id}" type="text" data-action="title-text" data-id="${line.id}" value="${escapeHtml(line.text)}" autocomplete="off">
              <label class="check fn-hl"><input type="checkbox" data-action="title-hl" data-id="${line.id}" ${line.highlight ? "checked" : ""}> Highlight</label>
              <button type="button" class="btn tiny ghost" data-action="title-remove" data-id="${line.id}">Remove</button>
            </div>
          `).join("")}
          <div class="row">
            <button type="button" class="btn tiny secondary" data-action="title-add">Add title line</button>
            <label class="check"><input type="checkbox" data-action="title-caps" ${notice.titleUppercase ? "checked" : ""}> Capitalise title</label>
          </div>
          <p class="hint">Tick Highlight for a yellow bar. In any box, ==yellow words== and **bold words** work too.</p>
        </div>
        <div>
          <p class="label">Opening</p>
          ${blocksHtml("before", notice.before, false)}
          <button type="button" class="btn tiny secondary" data-action="block-add" data-group="before">Add paragraph</button>
        </div>
      </div>
    </section>

    <section class="section">
      <h2><span>2</span> Directions</h2>
      <div class="stack">
        <button type="button" class="btn mirror" data-action="mirror" aria-pressed="${notice.mirrorOpposite}">
          Same but opposite for both directions
        </button>
        <p class="hint">Direction 2 uses direction 1’s streets in reverse, and swaps left and right. The map line turns around with it.</p>
        ${field("Line above the bullets", `<textarea id="intro" data-action="intro" rows="2">${escapeHtml(notice.directionsIntro)}</textarea>`)}
        ${notice.directions.map((direction, index) => directionCard(notice, shown, direction, index, ui)).join("")}
        <button type="button" class="btn secondary" data-action="dir-add">Add another direction</button>
        <div>
          <p class="label">After the directions</p>
          <p class="hint">Prints above the map or picture. Tick Bullet to sit it with the route list, like a missed-stops line.</p>
          ${blocksHtml("after", notice.after, true)}
          <button type="button" class="btn tiny secondary" data-action="block-add" data-group="after">Add paragraph</button>
        </div>
      </div>
    </section>

    <section class="section">
      <h2><span>3</span> Map or picture</h2>
      <div class="segment" role="group" aria-label="Map or picture">
        <button type="button" data-action="visual" data-value="map" aria-pressed="${notice.visual === "map"}">Map</button>
        <button type="button" data-action="visual" data-value="photo" aria-pressed="${notice.visual === "photo"}">Picture</button>
      </div>
      ${notice.visual === "map" ? mapTools(notice, shown, ui) : photoTools(notice)}
    </section>

    <section class="section">
      <h2><span>4</span> Sign-off</h2>
      <div class="stack">
        ${field("Under the map or picture", `<textarea id="thanks" data-action="thanks" rows="2" placeholder="Thank you for your co-operation.">${escapeHtml(notice.thanks)}</textarea>`)}
        <label class="check fn-blue"><input type="checkbox" data-action="thanks-blue" ${notice.thanksBlue ? "checked" : ""}> Blue italic</label>
        ${field("Date of issue", `<input id="issue-date" type="date" data-action="issue-date" value="${escapeHtml(notice.issueDate)}">`)}
        ${field("Name", `<input id="officer" type="text" data-action="officer" value="${escapeHtml(notice.officer)}" placeholder="Name" autocomplete="off">`)}
        ${field("Role", `<input id="role" type="text" data-action="role" value="${escapeHtml(notice.role)}" placeholder="Regional Field Officer" autocomplete="off">`)}
        <p class="hint">Print loads a sharper copy of the same map, then opens the browser’s print dialog. Turn on background graphics so the yellow, the black header, and the map are included. Choose Save as PDF for a file.</p>
      </div>
    </section>
  `;
}

function directionCard(notice, shown, direction, index, ui) {
  const linked = notice.mirrorOpposite && index === 1;
  const detail = linked ? shown[1].detail : direction.detail;
  const streets = extractStreets(detail);
  const color = safeColor(direction.color, "#d50000");
  const name = direction.label.trim() || `Direction ${index + 1}`;
  return `
    <article class="dir-card" style="--c:${color}">
      <header>
        <h3>Direction ${index + 1}${linked ? " · linked" : ""}</h3>
        <div class="row">
          <button type="button" class="btn tiny ghost" data-action="dir-up" data-id="${direction.id}" ${index === 0 ? "disabled" : ""}>Up</button>
          <button type="button" class="btn tiny ghost" data-action="dir-down" data-id="${direction.id}" ${index === notice.directions.length - 1 ? "disabled" : ""}>Down</button>
          <button type="button" class="btn tiny ghost" data-action="dir-remove" data-id="${direction.id}" ${notice.directions.length < 2 ? "disabled" : ""}>Remove</button>
        </div>
      </header>
      ${field("Runs as", `<input id="dir-label-${direction.id}" type="text" data-action="dir-label" data-id="${direction.id}" value="${escapeHtml(direction.label)}" placeholder="${index === 0 ? "Route 232 to city" : "Route 232 return"}" autocomplete="off">`)}
      ${field("How the bus travels", `<textarea id="dir-detail-${direction.id}" data-action="dir-detail" data-id="${direction.id}" rows="4" ${linked ? "readonly" : ""} placeholder="FROM Regency Road, RIGHT Young Street, RIGHT Pedder Crescent and normal running.">${escapeHtml(detail)}</textarea>`)}
      ${linked ? `<p class="hint">Generated from direction 1. Turn the opposite button off to edit this one yourself.</p>` : ""}
      ${streets.length >= 2 ? `<p class="streets">${escapeHtml(streets.join(" → "))}</p>` : ""}
      ${detail.trim() && streets.length < 2 && !/normal running/i.test(detail) ? `<p class="hint">Add at least two streets, written as FROM …, LEFT …, RIGHT …</p>` : ""}
      <div class="row">
        <span class="swatches" aria-label="Line colour for ${escapeHtml(name)}">
          ${SWATCHES.map((swatch) => `<button type="button" class="swatch" style="background:${swatch}" data-action="swatch" data-id="${direction.id}" data-color="${swatch}" aria-label="${swatch}"></button>`).join("")}
          <input type="color" data-action="dir-color" data-id="${direction.id}" value="${color}" aria-label="Custom line colour">
        </span>
        ${linked ? "" : `
          <button type="button" class="btn tiny secondary" data-action="dir-clear" data-id="${direction.id}" ${direction.points.length ? "" : "disabled"}>Clear line</button>
          <button type="button" class="btn tiny secondary" data-action="dir-snap" data-id="${direction.id}" ${direction.points.length >= 2 && !ui.busy ? "" : "disabled"}>Snap to roads</button>
        `}
      </div>
      ${linked
        ? `<p class="hint">Arrows follow direction 1 back the other way.</p>`
        : direction.points.length
          ? `<p class="hint">${direction.points.length} corner${direction.points.length === 1 ? "" : "s"} on the map. <button type="button" class="text-btn" data-action="undo-point" data-id="${direction.id}">Undo last</button></p>`
          : ""}
    </article>
  `;
}

function mapTools(notice, shown, ui) {
  const drawing = notice.directions.find((direction) => direction.id === ui.activeDirectionId) || notice.directions[0];
  const line = safeColor(drawing?.color, "#d50000");
  return `
    <div class="prompt">
      <strong>Map the detour each way</strong>
      Two directions are ready above. Use the opposite button if the return is the same roads backwards, or add another if a route takes different roads. Generate puts the lines and arrows on the notice.
    </div>
    <div class="stack">
      <div class="find-row">
        ${field("Suburb or area", `<input id="locality" type="text" data-action="locality" value="${escapeHtml(notice.map.locality)}" placeholder="Dudley Park, SA" autocomplete="off">`)}
        <button type="button" class="btn secondary" data-action="find-area" ${ui.busy || notice.map.locked ? "disabled" : ""}>Centre map</button>
      </div>
      <button type="button" class="btn generate" data-action="generate" ${ui.busy ? "disabled" : ""}>${ui.busy ? "Working…" : "Generate lines and arrows"}</button>
      <div>
        <p class="label">On the map</p>
        <div class="tools" role="group" aria-label="Map tools">
          ${toolButton("pan", "Move", ui)}
          ${toolButton("draw", "Draw route", ui, `--line:${line};--ink:${contrastInk(line)}`)}
          ${toolButton("work", "Work area", ui)}
          ${toolButton("closed", "Closed stop", ui)}
          ${toolButton("temp", "Temporary stop", ui)}
          ${toolButton("label", "Note", ui)}
          ${toolButton("zone-rect", "No-go box", ui)}
          ${toolButton("zone-poly", "No-go shape", ui)}
        </div>
        ${zoneDrawHtml(ui)}
      </div>
      <div>
        <p class="label">Drawing on</p>
        <div class="tools">
          ${notice.directions.map((direction, index) => {
            const linked = notice.mirrorOpposite && index === 1;
            const label = direction.label.trim() || `Direction ${index + 1}`;
            const streets = extractStreets(linked ? shown[1].detail : direction.detail);
            return `<button type="button" class="chip ${direction.id === ui.activeDirectionId ? "on" : ""}" data-action="active-dir" data-id="${direction.id}" ${linked ? "disabled" : ""}>
              <i style="background:${safeColor(direction.color, "#d50000")}"></i>
              ${escapeHtml(label)}${linked ? " · reverse" : streets.length >= 2 ? ` · ${streets.length} streets` : ""}
            </button>`;
          }).join("")}
        </div>
      </div>
      <label class="check"><input type="checkbox" data-action="north" ${notice.showNorth ? "checked" : ""}> North arrow</label>
      <label class="check"><input type="checkbox" data-action="lock-map" ${notice.map.locked ? "checked" : ""}> Lock map position</label>
      <button type="button" class="btn tiny secondary" data-action="fit-drawing" ${notice.map.locked ? "disabled" : ""}>Fit to drawing</button>
      <p class="hint">${notice.map.locked ? "Zoom and location are fixed. Fitting, centring, generating, and the zoom buttons leave the frame where it is until you unlock it." : "Fit to drawing zooms in on the finished lines, notes, and no-go zones. It stays off while the map position is locked."}</p>
      ${notesHtml(notice)}
      ${zonesHtml(notice)}
      <p class="hint">The map on the notice is the one that prints. Move it until the detour fills the frame. Drag a label away from its dot if it sits on a line. No-go box drags a rectangle. No-go shape clicks corners, then closes when you click the first corner again.</p>
    </div>
  `;
}

function zoneDrawHtml(ui) {
  if (ui.tool !== "zone-rect" && ui.tool !== "zone-poly") return "";
  const draft = ui.tool === "zone-poly" ? ui.draftZone : null;
  const count = draft?.points?.length || 0;
  return `
    <div class="tools" role="group" aria-label="No-go look">
      <button type="button" class="btn tiny fn fn-shade" data-action="zone-style" data-value="shade" aria-pressed="${ui.zoneStyle !== "hazard"}">Grey</button>
      <button type="button" class="btn tiny fn fn-hazard" data-action="zone-style" data-value="hazard" aria-pressed="${ui.zoneStyle === "hazard"}"><span>Stripes</span></button>
    </div>
    ${draft ? `
      <div class="row">
        <button type="button" class="btn tiny secondary" data-action="zone-finish" ${count >= 3 ? "" : "disabled"}>Finish zone</button>
        <button type="button" class="btn tiny ghost" data-action="zone-cancel">Cancel zone</button>
      </div>
      <p class="hint">${count} corner${count === 1 ? "" : "s"}. ${count >= 3 ? "Click the first corner to close it, or right-click a corner to remove it." : "Click to add corners. Right-click a corner to remove it."}</p>
    ` : ""}
  `;
}

function notesHtml(notice) {
  if (!notice.map.notes.length) {
    return `<p class="hint">Work areas, closed stops, and notes appear when you select that tool and click the map. Drag the dot and the label separately.</p>`;
  }
  return `
    <div class="stack">
      ${notice.map.notes.map((note) => `
        <div class="line-block">
          <textarea id="note-${note.id}" data-action="note-text" data-id="${note.id}" rows="2">${escapeHtml(note.text)}</textarea>
          <button type="button" class="btn tiny ghost" data-action="note-remove" data-id="${note.id}">Remove ${noteLabel(note.kind)}</button>
        </div>
      `).join("")}
    </div>
  `;
}

function zonesHtml(notice) {
  const zones = notice.map.zones || [];
  if (!zones.length) return "";
  return `
    <div class="stack">
      <p class="label">No-go zones</p>
      ${zones.map((zone, index) => `
        <div class="line-block">
          <p class="hint">${zone.shape === "rect" ? "Box" : "Shape"} ${index + 1}</p>
          <div class="tools">
            <button type="button" class="btn tiny fn fn-shade" data-action="zone-look" data-id="${zone.id}" data-value="shade" aria-pressed="${zone.style !== "hazard"}">Grey</button>
            <button type="button" class="btn tiny fn fn-hazard" data-action="zone-look" data-id="${zone.id}" data-value="hazard" aria-pressed="${zone.style === "hazard"}"><span>Stripes</span></button>
            <button type="button" class="btn tiny ghost" data-action="zone-remove" data-id="${zone.id}">Remove</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function photoTools(notice) {
  return `
    <div class="stack">
      <div class="drop" data-drop-photo>
        <p>Drop a picture of the stop, or a map you’ve already marked up. You can also paste one.</p>
        <label class="btn secondary">
          Choose picture
          <input id="photo-file" type="file" accept="image/*" data-action="photo" hidden>
        </label>
      </div>
      ${notice.photo ? `
        <img class="thumb" src="${escapeHtml(notice.photo)}" alt="Picture on the notice">
        <button type="button" class="btn tiny ghost" data-action="photo-clear">Remove picture</button>
      ` : ""}
    </div>
  `;
}

function blocksHtml(group, blocks, bullet) {
  return blocks.map((block) => `
    <div class="line-block">
      <textarea id="block-${group}-${block.id}" data-action="block-text" data-group="${group}" data-id="${block.id}" rows="3">${escapeHtml(block.text)}</textarea>
      <div class="row">
        <label class="check fn-hl"><input type="checkbox" data-action="block-hl" data-group="${group}" data-id="${block.id}" ${block.highlight ? "checked" : ""}> Highlight</label>
        <label class="check fn-ul"><input type="checkbox" data-action="block-ul" data-group="${group}" data-id="${block.id}" ${block.underline ? "checked" : ""}> Underline</label>
        <label class="check"><input type="checkbox" data-action="block-center" data-group="${group}" data-id="${block.id}" ${block.center ? "checked" : ""}> Centre</label>
        ${bullet ? `<label class="check"><input type="checkbox" data-action="block-bullet" data-group="${group}" data-id="${block.id}" ${block.bullet ? "checked" : ""}> Bullet</label>` : ""}
        <button type="button" class="btn tiny ghost" data-action="block-remove" data-group="${group}" data-id="${block.id}">Remove</button>
      </div>
    </div>
  `).join("");
}

function toolButton(value, label, ui, style = "") {
  const paint = style ? ` style="${style}"` : "";
  return `<button type="button" class="btn tiny fn fn-${value}" data-action="tool" data-value="${value}" aria-pressed="${ui.tool === value}"${paint}>${label}</button>`;
}

function contrastInk(hex) {
  const n = Number.parseInt(String(hex).replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#161616" : "#ffffff";
}

function field(label, control) {
  return `<label class="field"><span>${label}</span>${control}</label>`;
}

function noteLabel(kind) {
  if (kind === "work") return "work area";
  if (kind === "closed") return "closed stop";
  if (kind === "temp") return "temporary stop";
  return "note";
}
