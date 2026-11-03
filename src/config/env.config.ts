import { existsSync } from 'node:fs';
import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  // No default: the API only runs against a database it was pointed at.
  DATABASE_URL: z.url(),
});

type Config = z.infer<typeof configSchema>;

// Loaded in this order, and a variable that is already set is never
// overwritten: the real environment wins over .env.local, which wins over .env.
const ENV_FILES = ['.env.local', '.env'];

function loadEnvFiles(): void {
  for (const file of ENV_FILES) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

/** Parses the environment once at boot and fails fast with every problem listed. */
export function loadConfig(): Config {
  loadEnvFiles();
  const parsed = configSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid configuration: ${problems}`);
}
