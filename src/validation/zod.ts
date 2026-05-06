import type { ZodSchema } from 'zod';

export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new Error(`Validation error: ${r.error.issues.map((i) => i.message).join('; ')}`);
  }
  return r.data;
}
