import type { Context } from 'aws-lambda';
import { z } from 'zod';
import { EventBridgeEnvelope } from '@aws-lambda-powertools/parser/envelopes';
import { EventBridgeSchema } from '@aws-lambda-powertools/parser/schemas';
import type { EventBridgeEvent } from '@aws-lambda-powertools/parser/types';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger();

const orderSchema = z.object({
  id: z.number().positive(),
  description: z.string(),
  items: z.array(
    z.object({
      id: z.number().positive(),
      quantity: z.number(),
      description: z.string(),
    })
  ),
  optionalField: z.string().optional(),
});

export const handler = async (
  event: EventBridgeEvent,
  _context: Context
): Promise<void> => {
  const parsedEvent = EventBridgeSchema.safeParse(event); // (1)!
  parsedEvent.success
    ? logger.info('Event parsed successfully', parsedEvent.data)
    : logger.error('Event parsing failed', parsedEvent.error);
  const parsedEvenlope = EventBridgeEnvelope.safeParse(event, orderSchema); // (2)!
  parsedEvenlope.success
    ? logger.info('Event envelope parsed successfully', parsedEvenlope.data)
    : logger.error('Event envelope parsing failed', parsedEvenlope.error);
};
