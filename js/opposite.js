/**
 * Reversing a run of streets swaps the order and exchanges left and right.
 * FROM A, LEFT B, RIGHT C  ->  FROM C, LEFT B, RIGHT A
 * Straight stays straight. The result is editable text, not a locked instruction.
 */

const TURN_RE = /^(?:turn\s+)?(left|right|straight|u-turn|u turn)\b[\s:-]*(.*)$/i;

export function parseDirection(text) {
  const clean = stripMarkup(text).trim();
  if (!clean) return { maneuvers: [], trailer: "", streets: [] };

  let body = clean;
  let trailer = "";
  const trailerMatch = body.match(/^([\s\S]*?)(\s+and\s+normal\s+running\.?)([\s\S]*)$/i);
  if (trailerMatch) {
    body = trailerMatch[1].trim();
    trailer = " and Normal running." + trailerMatch[3];
  }

  const parts = body
    .split(/\s*(?:,|\n|;|\bthen\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const maneuvers = [];
  for (const part of parts) {
    if (/^normal running\.?$/i.test(part)) continue;
    if (part.split(/\s+/).length > 16) continue;

    const from = part.match(/^from\s+(.+)$/i);
    if (from && !maneuvers.some((maneuver) => maneuver.turn === null)) {
      const street = cleanStreet(from[1]);
      if (street) maneuvers.push({ turn: null, street, modifier: false });
      continue;
    }

    const turnMatch = part.match(TURN_RE);
    if (!turnMatch) continue;
    const onto = cleanStreet(turnMatch[2]);
    const modifier = !onto || /^(at|ahead|through)\b/i.test(onto);
    maneuvers.push({ turn: normalTurn(turnMatch[1]), street: onto, modifier });
  }

  const streets = maneuvers.filter((maneuver) => !maneuver.modifier && maneuver.street).map((maneuver) => maneuver.street);
  return { maneuvers, trailer, streets };
}

export function extractStreets(text) {
  return parseDirection(text).streets;
}

export function toOppositeDirections(text) {
  const source = stripMarkup(text).trim();
  const parsed = parseDirection(text);
  const moves = parsed.maneuvers.filter((maneuver) => !maneuver.modifier && maneuver.street);
  if (moves.length < 2) return text ?? "";

  const streets = moves.map((move) => move.street);
  const turns = moves.slice(1).map((move) => move.turn || "STRAIGHT");
  const reversedStreets = [...streets].reverse();
  const reversedTurns = [...turns].reverse().map(swapTurn);

  const chunks = [`FROM ${reversedStreets[0]}`];
  for (const modifier of [...parsed.maneuvers].filter((maneuver) => maneuver.modifier && maneuver.turn).reverse()) {
    const turn = swapTurn(modifier.turn);
    chunks.push(modifier.street ? `${turn} ${modifier.street}` : turn);
  }
  for (let i = 0; i < reversedTurns.length; i += 1) {
    chunks.push(`${reversedTurns[i]} ${reversedStreets[i + 1]}`);
  }

  let result = chunks.join(", ") + parsed.trailer;
  if (!parsed.trailer && source.endsWith(".") && !result.endsWith(".")) result += ".";
  return result;
}

function stripMarkup(text) {
  return String(text ?? "").replaceAll("==", "").replaceAll("**", "");
}

function cleanStreet(value) {
  return String(value ?? "")
    .replace(/[.\s]+$/g, "")
    .replace(/^(?:onto|on|into)\s+/i, "")
    .replace(/\s+and\s+normal\s+running$/i, "")
    .replace(/\s+normal\s+running$/i, "")
    .trim();
}

function normalTurn(value) {
  const turn = value.toUpperCase().replace(/\s+/g, " ");
  if (turn === "U TURN" || turn === "U-TURN") return "U-TURN";
  if (turn === "LEFT" || turn === "RIGHT" || turn === "STRAIGHT") return turn;
  return "STRAIGHT";
}

function swapTurn(turn) {
  if (turn === "LEFT") return "RIGHT";
  if (turn === "RIGHT") return "LEFT";
  return turn;
}
