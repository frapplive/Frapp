import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import {
  SUPABASE_KEEP_ALIVE_MS,
  createSupabaseDispatcher,
  createSupabaseFetch,
  supabaseDispatcherOptions,
} from './supabase-fetch';

/**
 * A server that answers like Supabase's edge does: it keeps the connection
 * open and sends no `Keep-Alive: timeout=` header, so how long an idle
 * connection lives is the client's choice alone. (Node's own `http` server
 * sends that header, and undici then follows the server's number.)
 */
function startServer(): Promise<{
  server: Server;
  url: string;
  connections: () => number;
  received: () => string;
}> {
  let connections = 0;
  let received = '';
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.on('data', (chunk) => {
      received += chunk.toString('latin1');
      // One answer per request: its last chunk is the one that ends the
      // headers of a bodiless request, or the multipart body's closing line.
      if (!/\r\n\r\n$|--\r\n$/.test(received)) return;
      socket.write(
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}',
      );
    });
  });
  server.on('close', () => sockets.forEach((socket) => socket.destroy()));
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        server,
        url: `http://127.0.0.1:${port}/`,
        connections: () => connections,
        received: () => received,
      });
    });
  });
}

const idle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('the Supabase connection pool', () => {
  let stop: () => Promise<void> = () => Promise.resolve();
  afterEach(() => stop());

  async function readTwice(keepAliveMs: number | undefined, gapMs: number) {
    const { server, url, connections } = await startServer();
    const dispatcher = createSupabaseDispatcher(keepAliveMs);
    stop = async () => {
      await dispatcher.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    };
    const pooledFetch = createSupabaseFetch(dispatcher);
    await (await pooledFetch(url)).text();
    await idle(gapMs);
    await (await pooledFetch(url)).text();
    return connections();
  }

  it('keeps idle connections far longer than the 4 seconds Node gives them', () => {
    expect(SUPABASE_KEEP_ALIVE_MS).toBeGreaterThanOrEqual(60_000);
    // The default pool is built with that number, not Node's.
    expect(supabaseDispatcherOptions()).toEqual({
      keepAliveTimeout: SUPABASE_KEEP_ALIVE_MS,
    });
  });

  it('sends a FormData body as multipart, as a Blob upload to Storage needs', async () => {
    const { server, url, received } = await startServer();
    const dispatcher = createSupabaseDispatcher();
    stop = async () => {
      await dispatcher.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    };
    const body = new FormData();
    body.append('', new Blob(['hello']), 'note.txt');
    await (
      await createSupabaseFetch(dispatcher)(url, { method: 'POST', body })
    ).text();
    expect(received()).toMatch(/content-type: multipart\/form-data/i);
    expect(received()).toContain('hello');
    expect(received()).not.toContain('[object FormData]');
  });

  it('reuses the open connection for a call made after an idle gap', async () => {
    expect(await readTwice(undefined, 300)).toBe(1);
  });

  it('opens a new one once the keep-alive has passed, so the setting is what decides', async () => {
    expect(await readTwice(50, 300)).toBe(2);
  });
});
