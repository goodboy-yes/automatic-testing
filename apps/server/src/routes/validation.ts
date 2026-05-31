import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

export function parseRequestBody<T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | undefined {
  const result = schema.safeParse(body);
  if (!result.success) {
    reply.code(400).send({ message: 'Invalid request body' });
    return undefined;
  }

  return result.data;
}
