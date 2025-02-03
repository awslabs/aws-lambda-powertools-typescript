import type { JSONValue } from '@aws-lambda-powertools/commons/types';
import type { Context, Handler } from 'aws-lambda';
import { IdempotencyConfig } from './IdempotencyConfig.js';
import { IdempotencyHandler } from './IdempotencyHandler.js';
import type {
  AnyFunction,
  IdempotencyLambdaHandlerOptions,
  ItempotentFunctionOptions,
} from './types/IdempotencyOptions.js';

const isContext = (arg: unknown): arg is Context => {
  return (
    arg !== undefined &&
    arg !== null &&
    typeof arg === 'object' &&
    'getRemainingTimeInMillis' in arg
  );
};

const isFnHandler = (
  fn: AnyFunction,
  args: Parameters<AnyFunction>
): fn is Handler => {
  // get arguments of function
  return (
    fn !== undefined &&
    fn !== null &&
    typeof fn === 'function' &&
    isContext(args[1])
  );
};

const isOptionsWithDataIndexArgument = (
  options: unknown
): options is IdempotencyLambdaHandlerOptions & {
  dataIndexArgument: number;
} => {
  return (
    options !== undefined &&
    options !== null &&
    typeof options === 'object' &&
    'dataIndexArgument' in options
  );
};

/**
 * Use function wrapper to make your function idempotent.
 * @example
 * ```ts
 * // this is your processing function with an example record { transactionId: '123', foo: 'bar' }
 * const processRecord = (record: Record<string, unknown>): any => {
 *   // you custom processing logic
 *   return result;
 * };
 *
 * // we use wrapper to make processing function idempotent with DynamoDBPersistenceLayer
 * const processIdempotently = makeIdempotent(processRecord, {
 *   persistenceStore: new DynamoDBPersistenceLayer()
 *   dataKeywordArgument: 'transactionId', // keyword argument to hash the payload and the result
 * });
 *
 * export const handler = async (
 *   _event: EventRecords,
 *   _context: Context
 * ): Promise<void> => {
 *   for (const record of _event.records) {
 *     const result = await processIdempotently(record);
 *     // do something with the result
 *   }
 *
 *   return Promise.resolve();
 * };
 *
 * @param fn - the function to make idempotent
 * @param options - the options to configure the idempotency behavior
 * ```
 */
function makeIdempotent<Func extends AnyFunction>(
  fn: Func,
  options: ItempotentFunctionOptions<Parameters<Func>>
): (...args: Parameters<Func>) => ReturnType<Func> {
  const { persistenceStore, config, keyPrefix } = options;
  const idempotencyConfig = config ? config : new IdempotencyConfig({});

  if (!idempotencyConfig.isEnabled()) return fn;

  return function (this: Handler, ...args: Parameters<Func>): ReturnType<Func> {
    let functionPayloadToBeHashed: JSONValue;

    if (isFnHandler(fn, args)) {
      idempotencyConfig.registerLambdaContext(args[1]);
      functionPayloadToBeHashed = args[0];
    } else {
      if (isOptionsWithDataIndexArgument(options)) {
        functionPayloadToBeHashed = args[options.dataIndexArgument];
      } else {
        functionPayloadToBeHashed = args[0];
      }
    }

    return new IdempotencyHandler({
      functionToMakeIdempotent: fn,
      idempotencyConfig: idempotencyConfig,
      persistenceStore: persistenceStore,
      keyPrefix: keyPrefix,
      functionArguments: args,
      functionPayloadToBeHashed,
      thisArg: this,
    }).handle() as ReturnType<Func>;
  };
}

export { makeIdempotent };
