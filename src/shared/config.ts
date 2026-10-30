import { z } from 'zod';

export const DEFAULT_DATABASE_URL =
  'postgres://booking:booking@localhost:54329/booking';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  DB_DRIVER: z.enum(['memory', 'postgres']).default('memory'),
  DATABASE_URL: z.url().default(DEFAULT_DATABASE_URL),
});

export type Config = z.infer<typeof configSchema>;

/** Parses the environment once at boot and fails fast with every problem listed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid configuration: ${problems}`);
}
