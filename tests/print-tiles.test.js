import assert from "node:assert/strict";
import { printTileOptions } from "../js/mapview.js";

for (const zoom of [12, 16, 17, 18, 18.4, 18.5, 19]) {
  const options = printTileOptions(zoom);
  assert.equal(options.zoomOffset, 0, `zoom ${zoom} must keep the on-screen scale`);
  assert.equal(options.tileSize, 256, `zoom ${zoom} must use the same tile size`);
  assert.equal(options.maxZoom, 19);
  assert.match(options.url, /osmand\.net\/hd\/\{z\}\/\{x\}\/\{y\}\.png$/);
}
