import assert from "node:assert/strict";
import { haversine } from "../js/geometry.js";
import { nameVariants, roadName, routeThroughStreets, sameStreet } from "../js/streetroute.js";

const ways = [
  way("Alpha Road", [
    [1, -34.9, 138.6],
    [2, -34.9, 138.603],
    [3, -34.9, 138.606],
  ]),
  way("Beta Street", [
    [4, -34.898, 138.603],
    [2, -34.9, 138.603],
    [5, -34.902, 138.603],
    [6, -34.904, 138.603],
  ]),
  way("Gamma Crescent", [
    [7, -34.902, 138.601],
    [5, -34.902, 138.603],
    [8, -34.902, 138.605],
  ]),
  way("Shortcut Lane", [
    [2, -34.9, 138.603],
    [7, -34.902, 138.601],
  ]),
];

const bias = { lat: -34.9, lng: 138.603 };

const rightRight = routeThroughStreets({
  streets: ["Alpha Road", "Beta Street", "Gamma Crescent"],
  turns: ["RIGHT", "RIGHT"],
  ways,
  bias,
});

assert.equal(rightRight.warnings.length, 0, rightRight.warnings.join(" "));
assert.ok(rightRight.path.length >= 2);
assert.ok(rightRight.turns[0].angle > 50 && rightRight.turns[0].angle < 130, `first turn ${rightRight.turns[0].angle}`);
assert.ok(rightRight.turns[1].angle > 50 && rightRight.turns[1].angle < 130, `second turn ${rightRight.turns[1].angle}`);
assert.ok(rightRight.path[0].lng < 138.602, "approach should come along Alpha from the west");
assert.ok(near(rightRight.path, { lat: -34.902, lng: 138.603 }) < 20, "line should reach Beta at Gamma");
assert.ok(rightRight.path[rightRight.path.length - 1].lng < 138.6025, "right onto Gamma continues west");
assert.ok(rightRight.path.some((point) => point.lat < -34.901), "the line should travel south on Beta");

const left = routeThroughStreets({
  streets: ["Alpha Rd", "Beta St"],
  turns: ["LEFT"],
  ways,
  bias,
});
assert.equal(left.warnings.length, 0, left.warnings.join(" "));
assert.ok(left.turns[0].angle < -50 && left.turns[0].angle > -130, `left turn ${left.turns[0].angle}`);
assert.ok(left.path[0].lng < 138.602, "left turn still approaches from the west");
assert.ok(left.path[left.path.length - 1].lat > -34.899, "left turn continues north");
assert.ok(left.path.every((point) => point.lat > -34.9005), "left turn should not run south toward Gamma");

const missing = routeThroughStreets({
  streets: ["Alpha Road", "Nowhere Avenue"],
  turns: ["LEFT"],
  ways,
  bias,
});
assert.equal(missing.path.length, 0);
assert.ok(missing.warnings.some((warning) => warning.includes("Nowhere Avenue")));

// A divided road can meet the side street on one carriageway only. The right
// turn is the other carriageway, a few metres away, not the one-way that makes a left.
const divided = [
  way("Regency Road", [
    [11, -34.9, 138.6035],
    [2, -34.9, 138.603],
    [12, -34.9, 138.6025],
  ], 1),
  way("Regency Road", [
    [13, -34.89992, 138.6025],
    [9, -34.89992, 138.603],
    [14, -34.89992, 138.6035],
  ], 1),
  way("Young Street", [
    [2, -34.9, 138.603],
    [5, -34.901, 138.603],
  ]),
];
const dividedRight = routeThroughStreets({
  streets: ["Regency Road", "Young Street"],
  turns: ["RIGHT"],
  ways: divided,
  bias,
});
assert.equal(dividedRight.warnings.length, 0, dividedRight.warnings.join(" "));
assert.ok(dividedRight.turns[0].angle > 50, `divided right was ${dividedRight.turns[0].angle}`);
assert.ok(dividedRight.path[0].lng < 138.603, "right turn should approach with the eastbound carriageway");
assert.ok(dividedRight.path[dividedRight.path.length - 1].lat < -34.9004, "right turn should continue south");

assert.equal(sameStreet("Gillingham Rd", "Gillingham Road"), true);
assert.equal(roadName("Stop 21 Fourth Ave"), "Fourth Ave");
assert.equal(roadName("Stop 15B (East side) Pedder Crescent"), "Pedder Crescent");
assert.equal(roadName("Fourth Ave"), "Fourth Ave");
assert.equal(roadName("Stop 19"), "");
assert.ok(nameVariants("Young Street").includes("Young St"));

console.log("street route tests passed");

function way(name, nodes, oneway = 0) {
  return {
    name,
    alt: "",
    oneway,
    nodes: nodes.map(([id, lat, lng]) => ({ id, lat, lng })),
  };
}

function near(path, point) {
  return Math.min(...path.map((item) => haversine(item, point)));
}
