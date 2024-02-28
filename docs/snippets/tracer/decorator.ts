import { Tracer } from '@aws-lambda-powertools/tracer';
import type { LambdaInterface } from '@aws-lambda-powertools/commons/types';

const tracer = new Tracer({ serviceName: 'serverlessAirline' });

class Lambda implements LambdaInterface {
  // Decorate your handler class method
  @tracer.captureLambdaHandler()
  public async handler(_event: unknown, _context: unknown): Promise<void> {
    tracer.getSegment();
  }
}

const handlerClass = new Lambda();
export const handler = handlerClass.handler.bind(handlerClass); // (1)
