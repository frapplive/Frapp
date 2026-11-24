/**
 * The Windows taskbar's unread mark (#4842).
 *
 * macOS and Linux draw a count on the icon themselves (`app.setBadgeCount`).
 * Windows has no count: a window gets one small overlay picture in the corner
 * of its taskbar button. Frapp shows a red dot there while anything is unread,
 * as Slack does, and says the number in the overlay's description, which a
 * screen reader reads. The picture is built here rather than shipped as a
 * file, so it can't go missing from a package.
 */
import { crc32, deflateSync } from "node:zlib";

/** Windows scales the overlay to 16px; 32 keeps it sharp at 200%. */
const SIZE = 32;
/** The red of the app's own unread counts: `--mention` in `packages/theme/src/signet.css`. */
const DOT = { r: 0xe5, g: 0x48, b: 0x4d };

/** What the overlay says to a screen reader, or `null` when there is no dot. */
export function badgeDescription(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 unread notification" : `${count} unread notifications`;
}

/** A red dot on a clear ground, as PNG bytes. */
export function badgeDotPng(): Buffer {
  const centre = (SIZE - 1) / 2;
  const radius = SIZE / 2 - 1;
  // Each row is a filter byte (0: none) and then RGBA per pixel.
  const rows = Buffer.alloc(SIZE * (1 + SIZE * 4));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const distance = Math.hypot(x - centre, y - centre);
      // One pixel of falloff, so the edge isn't stepped.
      const alpha = Math.max(0, Math.min(1, radius + 0.5 - distance));
      const at = y * (1 + SIZE * 4) + 1 + x * 4;
      rows[at] = DOT.r;
      rows[at + 1] = DOT.g;
      rows[at + 2] = DOT.b;
      rows[at + 3] = Math.round(alpha * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, checksum]);
}
