import { describe, expect, it } from "vitest";
import { parseCoordinateInput } from "./search";

describe("parseCoordinateInput", () => {
  it("parses direct lat,lng input", () => {
    expect(parseCoordinateInput("28.6139, 77.2090")).toEqual({ lat: 28.6139, lng: 77.209 });
  });

  it("rejects out-of-range and non-coordinate text", () => {
    expect(parseCoordinateInput("120.0, 77.0")).toBeNull();
    expect(parseCoordinateInput("Ridge patrol road")).toBeNull();
    expect(parseCoordinateInput("")).toBeNull();
  });
});
