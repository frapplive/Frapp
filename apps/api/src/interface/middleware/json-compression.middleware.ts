import compression from 'compression';
import type { ServerResponse } from 'node:http';
import type { Request, Response } from 'express';

/**
 * Below this, a response goes out as it is: gzip saves little on a few
 * hundred bytes, and the CPU is better spent elsewhere.
 */
export const JSON_COMPRESSION_THRESHOLD_BYTES = 1024;

/** Whether the response is a JSON body, by the type its handler set. */
export function isJsonResponse(res: ServerResponse): boolean {
  const type = res.getHeader('Content-Type');
  return typeof type === 'string' && /^application\/json\b/i.test(type);
}

/**
 * Gzips JSON responses for a caller that accepts it (#6088). The API sent
 * every body as it was, and Cloud Run passes a response through unchanged, so
 * a chapter's whole document list (about 640 bytes a row) reached a phone as
 * raw JSON: 1.9 MB for 3,000 files, which gzip makes 118 KB.
 *
 * JSON only, so a stream is never held back: Ask's answer stream
 * (`text/event-stream`-like, and marked `no-transform`) and any file a route
 * sends go out as they are written.
 */
export function jsonCompression() {
  return compression({
    threshold: JSON_COMPRESSION_THRESHOLD_BYTES,
    filter: (req: Request, res: Response) =>
      isJsonResponse(res) && compression.filter(req, res),
  });
}
