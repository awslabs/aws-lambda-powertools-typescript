import type { JSONValue } from '@aws-lambda-powertools/commons/types';
import type { Functions } from '@aws-lambda-powertools/jmespath/functions';
import type { Context, Handler } from 'aws-lambda';
import type { IdempotencyConfig } from '../IdempotencyConfig.js';
import type { BasePersistenceLayer } from '../persistence/BasePersistenceLayer.js';
import type { IdempotencyRecord } from '../persistence/IdempotencyRecord.js';

/**
 * Configuration options for the idempotency utility.
 *
 * When making a function idempotent you should always set a persistence store.
 *
 * @see {@link persistence/DynamoDBPersistenceLayer.DynamoDBPersistenceLayer | DynamoDBPersistenceLayer}
 *
 * Optionally, you can also pass a custom configuration object,
 * this allows you to customize the behavior of the idempotency utility.
 *
 */
type IdempotencyLambdaHandlerOptions = {
  persistenceStore: BasePersistenceLayer;
  config?: IdempotencyConfig;
  keyPrefix?: string;
};

/**
 * This generic type is used to represent any function with any number of arguments and any return type.
 *
 * It's left intentionally open to allow for any function to be wrapped.
 */
// biome-ignore lint/suspicious/noExplicitAny: This is a generic type that is intentionally open
type AnyFunction = (...args: Array<any>) => any;

/**
 * This is a conditional type that represents the options that can be passed to the `makeIdempotent` function.
 *
 * Depending on the function being wrapped, the options will be different. For example,
 * if the function being wrapped is a Lambda handler (as indicated by the presence of a `Context`
 * object as the second argument), then the options will be the standard `IdempotencyLambdaHandlerOptions`.
 *
 * If instead the function being wrapped is an arbitrary function, then the options can include a
 * `dataIndexArgument` property to indicate the index of the argument that contains the data to be hashed.
 *
 * The reasoning behind this is that the `makeIdempotent` function needs to know where to find the function
 * payload, and while we can make assumptions about the structure of a Lambda handler, we can't be certain
 * for an arbitrary function.
 *
 * When the function being wrapped is a Lambda handler the `event` object, which is always the first argument
 * of the handler, is used as idempoency payload. For this reason, you don't need to specify the `dataIndexArgument`.
 *
 * @example
 * ```ts
 * import type {
 *   APIGatewayProxyEvent,
 *   Context,
 *   APIGatewayProxyResult,
 * } from 'aws-lambda';
 * import { makeIdempotent } from '@aws-lambda-powertools/idempotency';
 * import { DynamoDBPersistenceLayer } from '@aws-lambda-powertools/idempotency/dynamodb';
 *
 * const myHandler = async (
 *   event: APIGatewayProxyEvent,
 *   context: Context
 * ): Promise<APIGatewayProxyResult> => {
 *   // your code goes here
 * };
 *
 * // Since the function being wrapped is a Lambda handler, the `event` object is used as idempotency payload
 * export const handler = makeIdempotent(myHandler, {
 *   persistenceStore: new DynamoDBPersistenceLayer({ tableName: 'my-table' }),
 * });
 * ```
 *
 * On the other hand, when the function being wrapped is an arbitray function, the data to be hashed can be extracted
 * from any argument of the function. In JavaScript, functions can be called with any number of arguments, and the
 * `dataIndexArgument` property is used to indicate the index of the argument that contains the payload.
 *
 * By default, if the `dataIndexArgument` property is not specified, the first argument is used as idempotency payload.
 * However, you can specify a different argument by setting the `dataIndexArgument` property. Note that the index of the
 * argument is zero-based, so the first argument has an index of `0`.
 *
 * @example
 * ```ts
 * import { makeIdempotent } from '@aws-lambda-powertools/idempotency';
 * import { DynamoDBPersistenceLayer } from '@aws-lambda-powertools/idempotency/dynamodb';
 *
 * const myFunction = (data: string, bar: number): string => {
 *   // your code goes here
 * };
 *
 * // This will use the `data` argument (first) as idempotency payload
 * const idempotentMyFunction = makeIdempotent(myFunction, {
 *   persistenceStore: new DynamoDBPersistenceLayer({ tableName: 'my-table' }),
 * });
 *
 * // This will use the `bar` argument as idempotency payload
 * const idempotentMyFunction = makeIdempotent(myFunction, {
 *   persistenceStore: new DynamoDBPersistenceLayer({ tableName: 'my-table' }),
 *   dataIndexArgument: 1,
 * });
 * ```
 *
 * If instead you want the Idempotency utility to use only part of your payload as idempotency payload, you can use
 * the `eventKeyJmesPath` property to indicate the JMESPath expression to use to extract part of the payload.
 *
 */
// biome-ignore lint/suspicious/noExplicitAny: This is a generic type that is intentionally open
type ItempotentFunctionOptions<T extends Array<any>> = T[1] extends Context
  ? IdempotencyLambdaHandlerOptions
  : IdempotencyLambdaHandlerOptions & {
      dataIndexArgument?: number;
    };

/**
 * @internal
 * Options to configure the behavior of the idempotency logic.
 *
 * This is an internal type that is used for configuration.
 */
type IdempotencyHandlerOptions = {
  /**
   * The arguments passed to the function.
   *
   * For example, if the function is `foo(a, b)`, then `functionArguments` will be `[a, b]`.
   * We need to keep track of the arguments so that we can pass them to the function when we call it.
   */
  functionArguments: unknown[];
  /**
   * The payload to be hashed.
   *
   * This is the argument that is used for the idempotency.
   */
  functionPayloadToBeHashed: JSONValue;
  /**
   * Reference to the function to be made idempotent.
   */
  functionToMakeIdempotent: AnyFunction;
  /**
   * Idempotency configuration options.
   */
  idempotencyConfig: IdempotencyConfig;
  /**
   * The custom idempotency key prefix.
   */
  keyPrefix?: string;
  /**
   * Persistence layer used to store the idempotency records.
   */
  persistenceStore: BasePersistenceLayer;
  /**
   * The `this` context to be used when calling the function.
   *
   * When decorating a class method, this will be the instance of the class.
   */
  thisArg?: Handler;
};

/**
 * A hook that runs when an idempotent request is made.
 */
type ResponseHook = (
  response: JSONValue,
  record: IdempotencyRecord
) => JSONValue;

/**
 * Idempotency configuration options
 */
type IdempotencyConfigOptions = {
  /**
   * An optional JMESPath expression to extract the idempotency key from the event record
   */
  eventKeyJmesPath?: string;
  /**
   * An optional JMESPath expression to extract the payload to be validated from the event record
   */
  payloadValidationJmesPath?: string;
  /**
   * Custom JMESPath functions to use when parsing the JMESPath expressions
   */
  jmesPathOptions?: Functions;
  /**
   * Throw an error if no idempotency key was found in the request, defaults to `false`
   */
  throwOnNoIdempotencyKey?: boolean;
  /**
   * The number of seconds to wait before a record is expired, defaults to `3600` (1 hour)
   */
  expiresAfterSeconds?: number;
  /**
   * Wheter to locally cache idempotency results, defaults to `false`
   */
  useLocalCache?: boolean;
  /**
   * Number of records to keep in the local cache, defaults to `256`
   */
  maxLocalCacheSize?: number;
  /**
   * Function to use for calculating hashes, defaults to `md5`
   */
  hashFunction?: string;
  /**
   * AWS Lambda Context object containing information about the current invocation, function, and execution environment
   */
  lambdaContext?: Context;
  /**
   * A hook that runs when an idempotent request is made
   */
  responseHook?: ResponseHook;
};

export type {
  AnyFunction,
  IdempotencyConfigOptions,
  ItempotentFunctionOptions,
  IdempotencyLambdaHandlerOptions,
  IdempotencyHandlerOptions,
  ResponseHook,
};
