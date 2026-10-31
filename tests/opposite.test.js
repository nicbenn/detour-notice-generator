import assert from "node:assert/strict";
import { extractStreets, toOppositeDirections } from "../js/opposite.js";
import { arrowsAlong, bearing } from "../js/geometry.js";

const forward = "FROM Oxenham Drive, LEFT Gillingham Road, LEFT Elizabeth Way, Right Philip Highway and Normal running.";
assert.equal(
  toOppositeDirections(forward),
  "FROM Philip Highway, LEFT Elizabeth Way, RIGHT Gillingham Road, RIGHT Oxenham Drive and Normal running.",
);

assert.deepEqual(extractStreets(forward), [
  "Oxenham Drive",
  "Gillingham Road",
  "Elizabeth Way",
  "Philip Highway",
]);

assert.equal(
  toOppositeDirections("FROM Regency Road, RIGHT Young Street, RIGHT Pedder Crescent."),
  "FROM Pedder Crescent, LEFT Young Street, LEFT Regency Road.",
);

assert.equal(
  toOppositeDirections("FROM A, STRAIGHT B, LEFT C"),
  "FROM C, RIGHT B, STRAIGHT A",
);

assert.equal(
  toOppositeDirections("FROM Oxenham Drive, LEFT Gillingham Road, RIGHT Elizabeth Way, STRAIGHT at the ROUNDABOUT and Normal running."),
  "FROM Elizabeth Way, STRAIGHT at the ROUNDABOUT, LEFT Gillingham Road, RIGHT Oxenham Drive and Normal running.",
);

const marked = "FROM ==Pedder Crescent== ==NORMAL RUNNING==.";
assert.equal(toOppositeDirections(marked), marked);
assert.deepEqual(extractStreets(marked), ["Pedder Crescent"]);

assert.equal(toOppositeDirections("Normal running."), "Normal running.");

assert.equal(
  toOppositeDirections("FROM A, LEFT B and Normal running. See below for the missed stop."),
  "FROM B, RIGHT A and Normal running. See below for the missed stop.",
);

assert.deepEqual(
  extractStreets("FROM ==Regency Road==, RIGHT **Young Street**, RIGHT Pedder Crescent"),
  ["Regency Road", "Young Street", "Pedder Crescent"],
);

const north = bearing({ lat: 0, lng: 0 }, { lat: 0.01, lng: 0 });
const east = bearing({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 });
assert.ok(north < 1 || north > 359, `north bearing was ${north}`);
assert.ok(Math.abs(east - 90) < 1, `east bearing was ${east}`);

const arrows = arrowsAlong([{ lat: 0, lng: 0 }, { lat: 0.01, lng: 0 }], 500);
assert.ok(arrows.length >= 1);
assert.ok(arrows[0].bearing < 1 || arrows[0].bearing > 359);

console.log("opposite and geometry tests passed");
