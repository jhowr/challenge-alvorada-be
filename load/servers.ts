import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';

export interface RunningServers {
  urls: string[];
  stop(): Promise<void>;
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function waitUntilUp(url: string, child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) {
      throw new Error('dist/main.js exited; run `pnpm build` first');
    }
    try {
      await fetch(`${url}/resources`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Server at ${url} did not start in time`);
}

/** Starts `count` instances of the compiled app, each on its own free port. */
export async function startServers(
  count: number,
  env: Record<string, string> = {},
): Promise<RunningServers> {
  const children: ChildProcess[] = [];
  const urls: string[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const port = await freePort();
      const child = spawn(process.execPath, ['dist/main.js'], {
        env: { ...process.env, ...env, PORT: String(port) },
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      children.push(child);
      urls.push(`http://localhost:${port}`);
    }
    await Promise.all(urls.map((url, i) => waitUntilUp(url, children[i]!)));
  } catch (error) {
    children.forEach((child) => child.kill());
    throw error;
  }
  return {
    urls,
    stop: async () => {
      await Promise.all(
        children.map(
          (child) =>
            new Promise<void>((resolve) => {
              if (child.exitCode !== null) return resolve();
              child.once('exit', () => resolve());
              child.kill('SIGTERM');
            }),
        ),
      );
    },
  };
}
