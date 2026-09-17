import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string(),
});

let parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(parsed.error);
  process.exit(1);
}

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}
