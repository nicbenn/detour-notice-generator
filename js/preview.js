import { effectiveDirections, formatIssueDate } from "./model.js";
import { richHtml } from "./rich.js";

export function renderSheet(notice) {
  const org = document.getElementById("out-org");
  org.textContent = notice.organisation.trim();
  org.hidden = !notice.organisation.trim();

  const banner = document.getElementById("out-banner");
  banner.textContent = notice.banner.trim();
  banner.hidden = !notice.banner.trim();

  const title = document.getElementById("out-title");
  title.classList.toggle("caps", notice.titleUppercase);
  const lines = notice.titleLines.filter((line) => line.text.trim());
  title.innerHTML = lines.length
    ? lines.map((line) => `<div class="title-line"><span class="${line.highlight ? "is-hl" : ""}">${richHtml(line.text)}</span></div>`).join("")
    : `<div class="title-placeholder no-print">Notice title</div>`;

  document.getElementById("out-before").innerHTML = paragraphHtml(notice.before.filter((block) => !block.bullet));

  const intro = document.getElementById("out-intro");
  intro.innerHTML = notice.directionsIntro.trim() ? `<p>${richHtml(notice.directionsIntro)}</p>` : "";

  const directions = effectiveDirections(notice).filter((direction) => direction.label.trim() || direction.detail.trim());
  const extraBullets = notice.after.filter((block) => block.bullet && block.text.trim());
  const list = document.getElementById("out-dirs");
  list.innerHTML = [
    ...directions.map((direction) => `
      <li>
        ${direction.label.trim() ? `<div class="dir-label">${richHtml(direction.label)}</div>` : ""}
        ${direction.detail.trim() ? `<div class="dir-detail">${richHtml(direction.detail)}</div>` : ""}
      </li>
    `),
    ...extraBullets.map((block) => `<li>${blockHtml(block)}</li>`),
  ].join("");
  list.hidden = directions.length === 0 && extraBullets.length === 0;

  document.getElementById("out-after").innerHTML = paragraphHtml(notice.after.filter((block) => !block.bullet));

  const frame = document.getElementById("visual-frame");
  const photo = document.getElementById("photo-view");
  const north = document.getElementById("north-rose");
  const hint = document.getElementById("map-hint");
  const hasLine = effectiveDirections(notice).some((direction) => (direction.path?.length || 0) >= 2 || (direction.points?.length || 0) >= 2);

  if (notice.visual === "photo") {
    frame.classList.add("is-photo");
    frame.classList.toggle("is-empty", !notice.photo);
    if (notice.photo) {
      photo.src = notice.photo;
      photo.hidden = false;
    } else {
      photo.removeAttribute("src");
      photo.hidden = true;
    }
    north.hidden = true;
    hint.hidden = true;
  } else {
    frame.classList.remove("is-photo", "is-empty");
    photo.hidden = true;
    north.hidden = !notice.showNorth;
    hint.hidden = hasLine;
  }

  const thanks = document.getElementById("out-thanks");
  thanks.innerHTML = notice.thanks.trim() ? richHtml(notice.thanks) : "";
  thanks.classList.toggle("blue", notice.thanksBlue);
  thanks.hidden = !notice.thanks.trim();

  const date = formatIssueDate(notice.issueDate);
  const who = [notice.officer.trim(), notice.role.trim()].filter(Boolean).join(", ");
  document.getElementById("out-signoff").innerHTML = [
    date ? `<p>Date of issue: ${escapeText(date)}</p>` : "",
    who ? `<p>${escapeText(who)}</p>` : "",
  ].join("");
}

function paragraphHtml(blocks) {
  return blocks
    .filter((block) => block.text.trim())
    .map((block) => `<p class="${block.center ? "is-center" : ""} ${block.underline ? "is-ul" : ""}">${blockHtml(block)}</p>`)
    .join("");
}

function blockHtml(block) {
  const rich = richHtml(block.text);
  return block.highlight ? `<mark>${rich}</mark>` : rich;
}

function escapeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
