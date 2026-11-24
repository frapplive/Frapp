import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import {
  SUPABASE_KEEP_ALIVE_MS,
  createSupabaseDispatcher,
  createSupabaseFetch,
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
}> {
  let connections = 0;
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.on('data', () => {
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
  });

  it('reuses the open connection for a call made after an idle gap', async () => {
    expect(await readTwice(undefined, 300)).toBe(1);
  });

  it('opens a new one once the keep-alive has passed, so the setting is what decides', async () => {
    expect(await readTwice(50, 300)).toBe(2);
  });
});
