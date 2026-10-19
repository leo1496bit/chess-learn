import { describe, expect, it } from "vitest";
import { openingFromEcoUrl } from "./opening";

const BASE = "https://www.chess.com/openings/";

describe("openingFromEcoUrl", () => {
  it.each([
    ["Philidor-Defense", "Philidor Defense", null],
    ["Scandinavian-Defense-2.e5", "Scandinavian Defense", "2.e5"],
    ["Pirc-Defense-Modern-Defense-Geller-System-2...Nf6-3.Nc3-e5", "Pirc Defense Modern Defense Geller System", "2...Nf6 3.Nc3 e5"],
    ["Kings-Pawn-Opening-1...e5", "King's Pawn Opening", "1...e5"],
    ["Queens-Pawn-Opening-Chigorin-Variation-2...Nf6", "Queen's Pawn Opening Chigorin Variation", "2...Nf6"],
    ["Giuoco-Piano-Game-Giuoco-Pianissimo-Italian-Four-Knights-Variation-5...O-O", "Giuoco Piano Game Giuoco Pianissimo Italian Four Knights Variation", "5...O-O"],
    ["Giuoco-Piano-Game-4.O-O-Nf6-5.d3-O-O-6.Bg5", "Giuoco Piano Game", "4.O-O Nf6 5.d3 O-O 6.Bg5"],
    ["French-Defense-Normal-Variation...3.Nc3-Nc6-4.Nf3-Nf6", "French Defense Normal Variation", "3.Nc3 Nc6 4.Nf3 Nf6"],
    ["Van-t-Kruijs-Opening-1...e5", "Van't Kruijs Opening", "1...e5"],
    ["Petrovs-Defense", "Petrov's Defense", null],
    ["Caro-Kann-Defense-Advance-Variation-3...Bf5", "Caro-Kann Defense Advance Variation", "3...Bf5"],
    ["Nimzo-Indian-Defense-Hubner-Variation-5.Nf3", "Nimzo-Indian Defense Hubner Variation", "5.Nf3"],
    ["Sicilian-Defense-Closed-2...Nc6-3.O-O-O", "Sicilian Defense Closed", "2...Nc6 3.O-O-O"],
  ])("%s", (slug, name, line) => {
    expect(openingFromEcoUrl(BASE + slug)).toEqual({ name, line });
  });

  it("renvoie null pour une ouverture inconnue ou une URL absente", () => {
    expect(openingFromEcoUrl(`${BASE}Undefined`)).toBeNull();
    expect(openingFromEcoUrl(undefined)).toBeNull();
    expect(openingFromEcoUrl("https://www.chess.com/game/live/1")).toBeNull();
  });
});
