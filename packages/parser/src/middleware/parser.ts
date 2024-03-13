import { type MiddyLikeRequest } from '@aws-lambda-powertools/commons/types';
import { type MiddlewareObj } from '@middy/core';
import { type ZodSchema } from 'zod';
import { type ParserOptions } from '../types/parser.js';
import { parse } from '../Parser.js';

``;

/**
 * A middiy middleware to parse your event.
 *
 * @exmaple
 * ```typescript
 * import { parser } from '@aws-lambda-powertools/parser/middleware';
 * import middy from '@middy/core';
 * import { sqsEnvelope } from '@aws-lambda-powertools/parser/envelopes/sqs;'
 *
 * const oderSchema = z.object({
 *   id: z.number(),
 *   description: z.string(),
 *   quantity: z.number(),
 * });
 *
 * type Order = z.infer<typeof oderSchema>;
 *
 * export const handler = middy(
 *   async (event: Order, _context: unknown): Promise<void> => {
 *     // event is validated as sqs message envelope
 *     // the body is unwrapped and parsed into object ready to use
 *     // you can now use event as Order in your code
 *   }
 * ).use(parser({ schema: oderSchema, envelope: sqsEnvelope }));
 * ```
 *
 * @param options
 */
const parser = <S extends ZodSchema>(
  options: ParserOptions<S>
): MiddlewareObj => {
  const before = (request: MiddyLikeRequest): void => {
    const { schema, envelope, safeParse } = options;

    request.event = parse(request.event, envelope, schema, safeParse);
  };

  return {
    before,
  };
};

export { parser };
