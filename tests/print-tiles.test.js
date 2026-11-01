import assert from "node:assert/strict";
import { printTileOptions } from "../js/mapview.js";

const street = printTileOptions(16);
assert.equal(street.zoomOffset, 2);
assert.equal(street.tileSize, 64);
assert.equal(street.maxZoom, 19);
assert.match(street.url, /\{z\}\/\{x\}\/\{y\}\.png$/);

assert.equal(printTileOptions(17).zoomOffset, 2);
assert.equal(printTileOptions(17).tileSize, 64);

assert.equal(printTileOptions(18).zoomOffset, 1);
assert.equal(printTileOptions(18).tileSize, 128);

assert.equal(printTileOptions(18.4).zoomOffset, 1);
assert.equal(printTileOptions(18.5).zoomOffset, 0);
assert.equal(printTileOptions(18.5).tileSize, 256);

assert.equal(printTileOptions(19).zoomOffset, 0);
assert.equal(printTileOptions(12).zoomOffset, 2);
