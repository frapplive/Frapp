import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { badgeDescription, badgeDotPng } from "./badge-overlay";

describe("badgeDescription", () => {
  it("says how many are unread, and nothing at zero", () => {
    expect(badgeDescription(0)).toBeNull();
    expect(badgeDescription(1)).toBe("1 unread notification");
    expect(badgeDescription(12)).toBe("12 unread notifications");
  });
});

describe("badgeDotPng", () => {
  it("is a 32px RGBA PNG: opaque red in the middle, clear in the corners", () => {
    const png = badgeDotPng();
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.toString("ascii", 12, 16)).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(32);
    expect(png.readUInt32BE(20)).toBe(32);

    const idatLength = png.readUInt32BE(33);
    expect(png.toString("ascii", 37, 41)).toBe("IDAT");
    const rows = inflateSync(png.subarray(41, 41 + idatLength));
    const pixel = (x: number, y: number) => [...rows.subarray(y * 129 + 1 + x * 4, y * 129 + 5 + x * 4)];
    expect(pixel(16, 16)).toEqual([0xed, 0x42, 0x45, 255]);
    expect(pixel(0, 0)[3]).toBe(0);
    expect(pixel(31, 31)[3]).toBe(0);
    expect(png.toString("ascii", png.length - 8, png.length - 4)).toBe("IEND");
  });
});
