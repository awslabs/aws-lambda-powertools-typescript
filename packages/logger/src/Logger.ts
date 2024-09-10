import { Console } from 'node:console';
import { randomInt } from 'node:crypto';
import { Utility } from '@aws-lambda-powertools/commons';
import type { HandlerMethodDecorator } from '@aws-lambda-powertools/commons/types';
import type { Context, Handler } from 'aws-lambda';
import merge from 'lodash.merge';
import { EnvironmentVariablesService } from './config/EnvironmentVariablesService.js';
import { LogJsonIndent } from './constants.js';
import type { LogItem } from './formatter/LogItem.js';
import { PowertoolsLogFormatter } from './formatter/PowertoolsLogFormatter.js';
import type { ConfigServiceInterface } from './types/ConfigServiceInterface.js';
import type {
  Environment,
  LogAttributes,
  LogFormatterInterface,
  LogLevel,
  LogLevelThresholds,
} from './types/Log.js';
import type {
  ConstructorOptions,
  CustomJsonReplacerFn,
  InjectLambdaContextOptions,
  LogFunction,
  LogItemExtraInput,
  LogItemMessage,
  LogRecordOrder,
  LoggerInterface,
  PowertoolsLogData,
} from './types/Logger.js';

/**
 * ## Intro
 * The Logger utility provides an opinionated logger with output structured as JSON.
 *
 * ## Key features
 *  * Capture key fields from Lambda context, cold start and structures logging output as JSON
 *  * Log Lambda context when instructed (disabled by default)
 *  * Log sampling prints all logs for a percentage of invocations (disabled by default)
 *  * Append additional keys to structured log at any point in time
 *
 * ## Usage
 *
 * For more usage examples, see [our documentation](https://docs.powertools.aws.dev/lambda/typescript/latest/core/logger/).
 *
 * ### Basic usage
 *
 * @example
 * ```typescript
 * import { Logger } from '@aws-lambda-powertools/logger';
 *
 * // Logger parameters fetched from the environment variables:
 * const logger = new Logger();
 * ```
 *
 * ### Functions usage with middleware
 *
 * If you use function-based Lambda handlers you can use the {@link injectLambdaContext} middleware
 * to automatically add context to your Lambda logs.
 *
 * @example
 * ```typescript
 * import { Logger } from '@aws-lambda-powertools/logger';
 * import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
 * import middy from '@middy/core';
 *
 * const logger = new Logger();
 *
 * const lambdaHandler = async (_event: unknown, _context: unknown) => {
 *     logger.info('This is an INFO log with some context');
 * };
 *
 * export const handler = middy(lambdaHandler).use(injectLambdaContext(logger));
 * ```
 *
 * ### Object oriented usage with decorators
 *
 * If instead you use TypeScript classes to wrap your Lambda handler you can use the {@link injectLambdaContext} decorator.
 *
 * @example
 * ```typescript
 * import { Logger } from '@aws-lambda-powertools/logger';
 * import type { LambdaInterface } from '@aws-lambda-powertools/commons/types';
 *
 * const logger = new Logger();
 *
 * class Lambda implements LambdaInterface {
 *     // Decorate your handler class method
 *     ⁣@logger.injectLambdaContext()
 *     public async handler(_event: unknown, _context: unknown): Promise<void> {
 *         logger.info('This is an INFO log with some context');
 *     }
 * }
 *
 * const handlerClass = new Lambda();
 * export const handler = handlerClass.handler.bind(handlerClass);
 * ```
 *
 * ### Functions usage with manual instrumentation
 *
 * If you prefer to manually instrument your Lambda handler you can use the methods in the Logger class directly.
 *
 * @example
 * ```typescript
 * import { Logger } from '@aws-lambda-powertools/logger';
 *
 * const logger = new Logger();
 *
 * export const handler = async (_event, context) => {
 *     logger.addContext(context);
 *     logger.info('This is an INFO log with some context');
 * };
 * ```
 *
 * @class
 * @see https://docs.powertools.aws.dev/lambda/typescript/latest/core/logger/
 */
class Logger extends Utility implements LoggerInterface {
  /**
   * Console instance used to print logs.
   *
   * In AWS Lambda, we create a new instance of the Console class so that we can have
   * full control over the output of the logs. In testing environments, we use the
   * default console instance.
   *
   * This property is initialized in the constructor in setOptions().
   *
   * @private
   */
  private console!: Console;
  /**
   * Custom config service instance used to configure the logger.
   */
  private customConfigService?: ConfigServiceInterface;
  /**
   * Environment variables service instance used to fetch environment variables.
   */
  private envVarsService = new EnvironmentVariablesService();
  /**
   * Whether to print the Lambda invocation event in the logs.
   */
  private logEvent = false;
  /**
   * Formatter used to format the log items.
   * @default new PowertoolsLogFormatter()
   */
  private logFormatter?: LogFormatterInterface;
  /**
   * JSON indentation used to format the logs.
   */
  private logIndentation: number = LogJsonIndent.COMPACT;
  /**
   * Log level used internally by the current instance of Logger.
   */
  private logLevel = 12;
  /**
   * Log level thresholds used internally by the current instance of Logger.
   *
   * The levels are in ascending order from the most verbose to the least verbose (no logs).
   */
  private readonly logLevelThresholds: LogLevelThresholds = {
    TRACE: 6,
    DEBUG: 8,
    INFO: 12,
    WARN: 16,
    ERROR: 20,
    CRITICAL: 24,
    SILENT: 28,
  };
  /**
   * Persistent log attributes that will be logged in all log items.
   */
  private persistentLogAttributes: LogAttributes = {};
  /**
   * Standard attributes managed by Powertools that will be logged in all log items.
   */
  private powertoolsLogData: PowertoolsLogData = <PowertoolsLogData>{};
  /**
   * Temporary log attributes that can be appended with `appendKeys()` method.
   */
  private temporaryLogAttributes: LogAttributes = {};
  /**
   * Buffer used to store logs until the logger is initialized.
   *
   * Sometimes we need to log warnings before the logger is fully initialized, however we can't log them
   * immediately because the logger is not ready yet. This buffer stores those logs until the logger is ready.
   */
  #buffer: [number, Parameters<Logger['createAndPopulateLogItem']>][] = [];
  /**
   * Flag used to determine if the logger is initialized.
   */
  #isInitialized = false;
  /**
   * Map used to hold the list of keys and their type.
   *
   * Because keys of different types can be overwritten, we keep a list of keys that were added and their last
   * type. We then use this map at log preparation time to pick the last one.
   */
  #keys: Map<string, 'temp' | 'persistent'> = new Map();
  /**
   * This is the initial log leval as set during the initialization of the logger.
   *
   * We keep this value to be able to reset the log level to the initial value when the sample rate is refreshed.
   */
  #initialLogLevel = this.logLevelThresholds.INFO;
  /**
   * Replacer function used to serialize the log items.
   */
  #jsonReplacerFn?: CustomJsonReplacerFn;

  /**
   * Log level used by the current instance of Logger.
   *
   * Returns the log level as a number. The higher the number, the less verbose the logs.
   * To get the log level name, use the {@link getLevelName()} method.
   */
  public get level(): number {
    return this.logLevel;
  }

  /**
   * Initialize the Logger class with an optional set of options (settings).
   *
   * @param {ConstructorOptions} options - The options to initialize the logger with.
   */
  public constructor(options: ConstructorOptions = {}) {
    super();
    const { customConfigService, ...rest } = options;
    this.setCustomConfigService(customConfigService);
    // all logs are buffered until the logger is initialized
    this.setOptions(rest);
    this.#isInitialized = true;
    for (const [level, log] of this.#buffer) {
      // we call the method directly and create the log item just in time
      this.printLog(level, this.createAndPopulateLogItem(...log));
    }
    this.#buffer = [];
  }

  /**
   * Add the current Lambda function's invocation context data to the powertoolLogData property of the instance.
   * This context data will be part of all printed log items.
   *
   * @param {Context} context - The Lambda function's invocation context.
   */
  public addContext(context: Context): void {
    this.addToPowertoolsLogData({
      lambdaContext: {
        invokedFunctionArn: context.invokedFunctionArn,
        coldStart: this.getColdStart(),
        awsRequestId: context.awsRequestId,
        memoryLimitInMB: context.memoryLimitInMB,
        functionName: context.functionName,
        functionVersion: context.functionVersion,
      },
    });
  }

  /**
   * Add the given persistent attributes (key-value pairs) to all log items generated by this Logger instance.
   *
   * @deprecated This method is deprecated and will be removed in the future major versions, please use {@link appendPersistentKeys()} instead.
   *
   * @param {LogAttributes} attributes - The attributes to add to all log items.
   */
  public addPersistentLogAttributes(attributes: LogAttributes): void {
    this.appendPersistentKeys(attributes);
  }

  /**
   * Add the given temporary attributes (key-value pairs) to all log items generated by this Logger instance.
   *
   * @param {LogAttributes} attributes
   */
  public appendKeys(attributes: LogAttributes): void {
    for (const attributeKey of Object.keys(attributes)) {
      this.#keys.set(attributeKey, 'temp');
    }
    merge(this.temporaryLogAttributes, attributes);
  }

  /**
   * Add the given persistent attributes (key-value pairs) to all log items generated by this Logger instance.
   *
   * @param attributes - The attributes to add to all log items.
   */
  public appendPersistentKeys(attributes: LogAttributes): void {
    for (const attributeKey of Object.keys(attributes)) {
      this.#keys.set(attributeKey, 'persistent');
    }
    merge(this.persistentLogAttributes, attributes);
  }

  /**
   * Create a separate Logger instance, identical to the current one.
   * It's possible to overwrite the new instance options by passing them.
   *
   * @param {ConstructorOptions} options - The options to initialize the child logger with.
   */
  public createChild(options: ConstructorOptions = {}): Logger {
    const childLogger = this.createLogger(
      // Merge parent logger options with options passed to createChild,
      // the latter having precedence.
      merge(
        {},
        {
          logLevel: this.getLevelName(),
          serviceName: this.powertoolsLogData.serviceName,
          sampleRateValue: this.powertoolsLogData.sampleRateValue,
          logFormatter: this.getLogFormatter(),
          customConfigService: this.getCustomConfigService(),
          environment: this.powertoolsLogData.environment,
          persistentLogAttributes: this.persistentLogAttributes,
          temporaryLogAttributes: this.temporaryLogAttributes,
          jsonReplacerFn: this.#jsonReplacerFn,
        },
        options
      )
    );
    if (this.powertoolsLogData.lambdaContext)
      childLogger.addContext(
        this.powertoolsLogData.lambdaContext as unknown as Context
      );

    return childLogger;
  }

  /**
   * Print a log item with level CRITICAL.
   *
   * @param {LogItemMessage} input - The log message.
   * @param {Error | LogAttributes | string} extraInput - The extra input to log.
   */
  public critical(
    input: LogItemMessage,
    ...extraInput: LogItemExtraInput
  ): void {
    this.processLogItem(this.logLevelThresholds.CRITICAL, input, extraInput);
  }

  /**
   * Print a log item with level DEBUG.
   *
   * @param {LogItemMessage} input
   * @param {Error | LogAttributes | string} extraInput - The extra input to log.
   */
  public debug(input: LogItemMessage, ...extraInput: LogItemExtraInput): void {
    this.processLogItem(this.logLevelThresholds.DEBUG, input, extraInput);
  }

  /**
   * Print a log item with level ERROR.
   *
   * @param {LogItemMessage} input - The log message.
   * @param {Error | LogAttributes | string} extraInput - The extra input to log.
   */
  public error(input: LogItemMessage, ...extraInput: LogItemExtraInput): void {
    this.processLogItem(this.logLevelThresholds.ERROR, input, extraInput);
  }

  /**
   * Get the log level name of the current instance of Logger.
   *
   * Returns the log level name, i.e. `INFO`, `DEBUG`, etc.
   * To get the log level as a number, use the {@link Logger.level} property.
   */
  public getLevelName(): Uppercase<LogLevel> {
    return this.getLogLevelNameFromNumber(this.logLevel);
  }

  /**
   * Return a boolean value. True means that the Lambda invocation events
   * are printed in the logs.
   */
  public getLogEvent(): boolean {
    return this.logEvent;
  }

  /**
   * Return the persistent log attributes, which are the attributes
   * that will be logged in all log items.
   */
  public getPersistentLogAttributes(): LogAttributes {
    return this.persistentLogAttributes;
  }

  /**
   * Print a log item with level INFO.
   *
   * @param {LogItemMessage} input - The log message.
   * @param {Error | LogAttributes | string} extraInput - The extra input to log.
   */
  public info(input: LogItemMessage, ...extraInput: LogItemExtraInput): void {
    this.processLogItem(this.logLevelThresholds.INFO, input, extraInput);
  }

  /**
   * Method decorator that adds the current Lambda function context as extra
   * information in all log items.
   *
   * The decorator can be used only when attached to a Lambda function handler which
   * is written as method of a class, and should be declared just before the handler declaration.
   *
   * Note: Currently TypeScript only supports decorators on classes and methods. If you are using the
   * function syntax, you should use the middleware instead.
   *
   * @example
   * ```typescript
   * import { Logger } from '@aws-lambda-powertools/logger';
   * import type { LambdaInterface } from '@aws-lambda-powertools/commons/types';
   *
   * const logger = new Logger();
   *
   * class Lambda implements LambdaInterface {
   *     // Decorate your handler class method
   *     ⁣@logger.injectLambdaContext()
   *     public async handler(_event: unknown, _context: unknown): Promise<void> {
   *         logger.info('This is an INFO log with some context');
   *     }
   * }
   *
   * const handlerClass = new Lambda();
   * export const handler = handlerClass.handler.bind(handlerClass);
   * ```
   *
   * @see https://www.typescriptlang.org/docs/handbook/decorators.html#method-decorators
   */
  public injectLambdaContext(
    options?: InjectLambdaContextOptions
  ): HandlerMethodDecorator {
    return (_target, _propertyKey, descriptor) => {
      // biome-ignore lint/style/noNonNullAssertion: The descriptor.value is the method this decorator decorates, it cannot be undefined.
      const originalMethod = descriptor.value!;
      const loggerRef = this;
      // Use a function() {} instead of an () => {} arrow function so that we can
      // access `myClass` as `this` in a decorated `myClass.myMethod()`.
      descriptor.value = async function (
        this: Handler,
        event,
        context,
        callback
      ) {
        Logger.injectLambdaContextBefore(loggerRef, event, context, options);

        let result: unknown;
        try {
          result = await originalMethod.apply(this, [event, context, callback]);
        } finally {
          if (options?.clearState || options?.resetKeys) loggerRef.resetKeys();
        }

        return result;
      };
    };
  }

  /**
   * @deprecated This method is deprecated and will be removed in the future major versions. Use {@link resetKeys()} instead.
   */
  /* istanbul ignore next */
  public static injectLambdaContextAfterOrOnError(
    logger: Logger,
    _persistentAttributes: LogAttributes,
    options?: InjectLambdaContextOptions
  ): void {
    if (options && (options.clearState || options?.resetKeys)) {
      logger.resetKeys();
    }
  }

  public static injectLambdaContextBefore(
    logger: Logger,
    event: unknown,
    context: Context,
    options?: InjectLambdaContextOptions
  ): void {
    logger.addContext(context);

    let shouldLogEvent = undefined;
    if (options && Object.hasOwn(options, 'logEvent')) {
      shouldLogEvent = options.logEvent;
    }
    logger.logEventIfEnabled(event, shouldLogEvent);
  }

  /**
   * Log the AWS Lambda event payload for the current invocation if the environment variable `POWERTOOLS_LOG_EVENT` is set to `true`.
   *
   * @example
   * ```ts
   * process.env.POWERTOOLS_LOG_EVENT = 'true';
   *
   * import { Logger } from '@aws-lambda-powertools/logger';
   *
   * const logger = new Logger();
   *
   * export const handler = async (event) => {
   *   logger.logEventIfEnabled(event);
   *   // ... your handler code
   * }
   * ```
   *
   * @param {unknown} event - The AWS Lambda event payload.
   * @param {boolean} overwriteValue - Overwrite the environment variable value.
   */
  public logEventIfEnabled(event: unknown, overwriteValue?: boolean): void {
    if (!this.shouldLogEvent(overwriteValue)) return;
    this.info('Lambda invocation event', { event });
  }

  /**
   * This method allows recalculating the initial sampling decision for changing
   * the log level to DEBUG based on a sample rate value used during initialization,
   * potentially yielding a different outcome.
   */
  public refreshSampleRateCalculation(): void {
    this.setInitialSampleRate(this.powertoolsLogData.sampleRateValue);
  }

  /**
   * Remove temporary attributes based on provided keys to all log items generated by this Logger instance.
   *
   * @param {string[]} keys - The keys to remove.
   */
  public removeKeys(keys: string[]): void {
    for (const key of keys) {
      this.temporaryLogAttributes[key] = undefined;

      if (this.persistentLogAttributes[key]) {
        this.#keys.set(key, 'persistent');
      } else {
        this.#keys.delete(key);
      }
    }
  }

  /**
   * Remove the given keys from the persistent keys.
   *
   * @example
   * ```typescript
   * import { Logger } from '@aws-lambda-powertools/logger';
   *
   * const logger = new Logger({
   *   persistentKeys: {
   *     environment: 'prod',
   *   },
   * });
   *
   * logger.removePersistentKeys(['environment']);
   * ```
   *
   * @param keys - The keys to remove from the persistent attributes.
   */
  public removePersistentKeys(keys: string[]): void {
    for (const key of keys) {
      this.persistentLogAttributes[key] = undefined;

      if (this.temporaryLogAttributes[key]) {
        this.#keys.set(key, 'temp');
      } else {
        this.#keys.delete(key);
      }
    }
  }

  /**
   * @deprecated This method is deprecated and will be removed in the future major versions. Use {@link removePersistentKeys()} instead.
   *
   * @param {string[]} keys - The keys to remove.
   */
  public removePersistentLogAttributes(keys: string[]): void {
    this.removePersistentKeys(keys);
  }

  /**
   * Remove all temporary log attributes added with `appendKeys()` method.
   */
  public resetKeys(): void {
    for (const key of Object.keys(this.temporaryLogAttributes)) {
      if (this.persistentLogAttributes[key]) {
        this.#keys.set(key, 'persistent');
      } else {
        this.#keys.delete(key);
      }
    }
    this.temporaryLogAttributes = {};
  }

  /**
   * Set the log level for this Logger instance.
   *
   * If the log level is set using AWS Lambda Advanced Logging Controls, it sets it
   * instead of the given log level to avoid data loss.
   *
   * @param logLevel The log level to set, i.e. `error`, `warn`, `info`, `debug`, etc.
   */
  public setLogLevel(logLevel: LogLevel): void {
    if (this.awsLogLevelShortCircuit(logLevel)) return;
    if (this.isValidLogLevel(logLevel)) {
      this.logLevel = this.logLevelThresholds[logLevel];
    } else {
      throw new Error(`Invalid log level: ${logLevel}`);
    }
  }

  /**
   * Set the given attributes (key-value pairs) to all log items generated by this Logger instance.
   * Note: this replaces the pre-existing value.
   *
   * @deprecated This method is deprecated and will be removed in the future major versions, please use {@link appendPersistentKeys()} instead.
   *
   * @param {LogAttributes} attributes - The attributes to set.
   */
  public setPersistentLogAttributes(attributes: LogAttributes): void {
    this.persistentLogAttributes = attributes;
  }

  /**
   * Check whether the current Lambda invocation event should be printed in the logs or not.
   *
   * @private
   * @param {boolean} [overwriteValue] - Overwrite the environment variable value.
   */
  public shouldLogEvent(overwriteValue?: boolean): boolean {
    if (typeof overwriteValue === 'boolean') {
      return overwriteValue;
    }

    return this.getLogEvent();
  }

  /**
   * Print a log item with level TRACE.
   *
   * @param {LogItemMessage} input - The log message.
   * @param {Error | LogAttributes | string} extraInput - The extra input to log.
   */
  public trace(input: LogItemMessage, ...extraInput: LogItemExtraInput): void {
    this.processLogItem(this.logLevelThresholds.TRACE, input, extraInput);
  }

  /**
   * Print a log item with level WARN.
   *
   * @param {LogItemMessage} input - The log message.
   * @param {Error | LogAttributes | string} extraInput - The extra input to log.
   */
  public warn(input: LogItemMessage, ...extraInput: LogItemExtraInput): void {
    this.processLogItem(this.logLevelThresholds.WARN, input, extraInput);
  }

  /**
   * Factory method for instantiating logger instances. Used by `createChild` method.
   * Important for customization and subclassing. It allows subclasses, like `MyOwnLogger`,
   * to override its behavior while keeping the main business logic in `createChild` intact.
   *
   * @example
   * ```typescript
   * // MyOwnLogger subclass
   * class MyOwnLogger extends Logger {
   *   protected createLogger(options?: ConstructorOptions): MyOwnLogger {
   *     return new MyOwnLogger(options);
   *   }
   *   // No need to re-implement business logic from `createChild` and keep track on changes
   *   public createChild(options?: ConstructorOptions): MyOwnLogger {
   *     return super.createChild(options) as MyOwnLogger;
   *   }
   * }
   * ```
   *
   * @param {ConstructorOptions} [options] Logger configuration options.
   */
  protected createLogger(options?: ConstructorOptions): Logger {
    return new Logger(options);
  }

  /**
   * A custom JSON replacer function that is used to serialize the log items.
   *
   * By default, we already extend the default serialization behavior to handle `BigInt` and `Error` objects, as well as remove circular references.
   * When a custom JSON replacer function is passed to the Logger constructor, it will be called **before** our custom rules for each key-value pair in the object being stringified.
   *
   * This allows you to customize the serialization while still benefiting from the default behavior.
   *
   * @see {@link ConstructorOptions.jsonReplacerFn}
   */
  protected getJsonReplacer(): (key: string, value: unknown) => void {
    const references = new WeakSet();

    return (key, value) => {
      let replacedValue = value;
      if (this.#jsonReplacerFn)
        replacedValue = this.#jsonReplacerFn?.(key, replacedValue);

      if (replacedValue instanceof Error) {
        replacedValue = this.getLogFormatter().formatError(replacedValue);
      }
      if (typeof replacedValue === 'bigint') {
        return replacedValue.toString();
      }
      if (typeof replacedValue === 'object' && replacedValue !== null) {
        if (references.has(replacedValue)) {
          return;
        }
        references.add(replacedValue);
      }

      return replacedValue;
    };
  }

  /**
   * Store information that is printed in all log items.
   *
   * @param {Partial<PowertoolsLogData>} attributes
   * @private
   * @returns {void}
   */
  private addToPowertoolsLogData(attributes: Partial<PowertoolsLogData>): void {
    merge(this.powertoolsLogData, attributes);
  }

  private awsLogLevelShortCircuit(selectedLogLevel?: string): boolean {
    const awsLogLevel = this.getEnvVarsService().getAwsLogLevel();
    if (this.isValidLogLevel(awsLogLevel)) {
      this.logLevel = this.logLevelThresholds[awsLogLevel];

      if (
        this.isValidLogLevel(selectedLogLevel) &&
        this.logLevel > this.logLevelThresholds[selectedLogLevel]
      ) {
        this.warn(
          `Current log level (${selectedLogLevel}) does not match AWS Lambda Advanced Logging Controls minimum log level (${awsLogLevel}). This can lead to data loss, consider adjusting them.`
        );
      }

      return true;
    }

    return false;
  }

  /**
   * Create a log item and populate it with the given log level, input, and extra input.
   *
   * We start with creating an object with base attributes managed by Powertools.
   * Then we create a second object with persistent attributes provided by customers either
   * directly to the log entry or through initial configuration and `appendKeys` method.
   *
   * Once we have the two objects, we pass them to the formatter that will apply the desired
   * formatting to the log item.
   *
   * @param logLevel The log level of the log item to be printed
   * @param input The main input of the log item, this can be a string or an object with additional attributes
   * @param extraInput Additional attributes to be added to the log item
   */
  private createAndPopulateLogItem(
    logLevel: number,
    input: LogItemMessage,
    extraInput: LogItemExtraInput
  ): LogItem {
    let message = '';
    let otherInput: { [key: string]: unknown } = {};
    if (typeof input === 'string') {
      message = input;
    } else {
      const { message: inputMessage, ...rest } = input;
      message = inputMessage;
      otherInput = rest;
    }

    // create base attributes
    const unformattedBaseAttributes = {
      logLevel: this.getLogLevelNameFromNumber(logLevel),
      timestamp: new Date(),
      message,
      xRayTraceId: this.envVarsService.getXrayTraceId(),
      ...this.getPowertoolsLogData(),
    };

    const additionalAttributes: LogAttributes = {};
    // gradually add additional attributes picking only the last added for each key
    for (const [key, type] of this.#keys) {
      if (type === 'persistent') {
        additionalAttributes[key] = this.persistentLogAttributes[key];
      } else {
        additionalAttributes[key] = this.temporaryLogAttributes[key];
      }
    }

    // if the main input is not a string, then it's an object with additional attributes, so we merge it
    merge(additionalAttributes, otherInput);
    // then we merge the extra input attributes (if any)
    for (const item of extraInput) {
      const attributes: LogAttributes =
        item instanceof Error
          ? { error: item }
          : typeof item === 'string'
            ? { extra: item }
            : item;

      merge(additionalAttributes, attributes);
    }

    return this.getLogFormatter().formatAttributes(
      unformattedBaseAttributes,
      additionalAttributes
    );
  }

  /**
   * Get the custom config service, an abstraction used to fetch environment variables.
   *
   * @private
   */
  private getCustomConfigService(): ConfigServiceInterface | undefined {
    return this.customConfigService;
  }

  /**
   * Get the instance of a service that fetches environment variables.
   *
   * @private
   */
  private getEnvVarsService(): EnvironmentVariablesService {
    return this.envVarsService as EnvironmentVariablesService;
  }

  /**
   * Get the instance of a service that formats the structure of a
   * log item's keys and values in the desired way.
   *
   * @private
   */
  private getLogFormatter(): LogFormatterInterface {
    return this.logFormatter as LogFormatterInterface;
  }

  /**
   * Get the log level name from the log level number.
   *
   * For example, if the log level is 16, it will return 'WARN'.
   *
   * @param logLevel - The log level to get the name of
   */
  private getLogLevelNameFromNumber(logLevel: number): Uppercase<LogLevel> {
    let found: Uppercase<LogLevel> | undefined;
    for (const [key, value] of Object.entries(this.logLevelThresholds)) {
      if (value === logLevel) {
        found = key as Uppercase<LogLevel>;
        break;
      }
    }

    return found as Uppercase<LogLevel>;
  }

  /**
   * Get information that will be added in all log item by
   * this Logger instance (different from user-provided persistent attributes).
   *
   * @private
   */
  private getPowertoolsLogData(): PowertoolsLogData {
    return this.powertoolsLogData;
  }

  /**
   * Check if a given log level is valid.
   *
   * @param {LogLevel} logLevel - The log level to check
   * @private
   */
  private isValidLogLevel(
    logLevel?: LogLevel | string
  ): logLevel is Uppercase<LogLevel> {
    return typeof logLevel === 'string' && logLevel in this.logLevelThresholds;
  }

  /**
   * Check if a given sample rate value is valid.
   *
   * @param sampleRateValue
   * @private
   */
  private isValidSampleRate(
    sampleRateValue?: number
  ): sampleRateValue is number {
    return (
      typeof sampleRateValue === 'number' &&
      0 <= sampleRateValue &&
      sampleRateValue <= 1
    );
  }

  /**
   * Print a given log with given log level.
   *
   * @param {number} logLevel - The log level
   * @param {LogItem} log - The log item to print
   * @private
   */
  private printLog(logLevel: number, log: LogItem): void {
    log.prepareForPrint();

    const consoleMethod =
      logLevel === this.logLevelThresholds.CRITICAL
        ? 'error'
        : (this.getLogLevelNameFromNumber(logLevel).toLowerCase() as keyof Omit<
            LogFunction,
            'critical'
          >);

    this.console[consoleMethod](
      JSON.stringify(
        log.getAttributes(),
        this.getJsonReplacer(),
        this.logIndentation
      )
    );
  }

  /**
   * Print a given log with given log level.
   *
   * @param {number} logLevel - The log level
   * @param {LogItemMessage} input - The log message
   * @param {LogItemExtraInput} extraInput - The extra input to log
   * @private
   */
  private processLogItem(
    logLevel: number,
    input: LogItemMessage,
    extraInput: LogItemExtraInput
  ): void {
    if (logLevel >= this.logLevel) {
      if (this.#isInitialized) {
        this.printLog(
          logLevel,
          this.createAndPopulateLogItem(logLevel, input, extraInput)
        );
      } else {
        this.#buffer.push([logLevel, [logLevel, input, extraInput]]);
      }
    }
  }

  /**
   * Initialize the console property as an instance of the internal version of Console() class (PR #748)
   * or as the global node console if the `POWERTOOLS_DEV' env variable is set and has truthy value.
   *
   * @private
   */
  private setConsole(): void {
    if (!this.getEnvVarsService().isDevMode()) {
      this.console = new Console({
        stdout: process.stdout,
        stderr: process.stderr,
      });
    } else {
      this.console = console;
    }

    /**
     * Patch `console.trace` to avoid printing a stack trace and aligning with AWS Lambda behavior - see #2902
     */
    this.console.trace = (message: string, ...optionalParams: unknown[]) => {
      this.console.log(message, ...optionalParams);
    };
  }

  /**
   * Set the Logger's customer config service instance, which will be used
   * to fetch environment variables.
   *
   * @private
   * @param {ConfigServiceInterface} customConfigService - The custom config service
   */
  private setCustomConfigService(
    customConfigService?: ConfigServiceInterface
  ): void {
    this.customConfigService = customConfigService
      ? customConfigService
      : undefined;
  }

  /**
   * Set the initial Logger log level based on the following order:
   * 1. If a log level is set using AWS Lambda Advanced Logging Controls, it sets it.
   * 2. If a log level is passed to the constructor, it sets it.
   * 3. If a log level is set via custom config service, it sets it.
   * 4. If a log level is set via env variables, it sets it.
   *
   * If none of the above is true, the default log level applies (`INFO`).
   *
   * @private
   * @param {LogLevel} [logLevel] - Log level passed to the constructor
   */
  private setInitialLogLevel(logLevel?: LogLevel): void {
    const constructorLogLevel = logLevel?.toUpperCase();

    if (this.awsLogLevelShortCircuit(constructorLogLevel)) return;

    if (this.isValidLogLevel(constructorLogLevel)) {
      this.logLevel = this.logLevelThresholds[constructorLogLevel];
      this.#initialLogLevel = this.logLevel;

      return;
    }
    const customConfigValue = this.getCustomConfigService()
      ?.getLogLevel()
      ?.toUpperCase();
    if (this.isValidLogLevel(customConfigValue)) {
      this.logLevel = this.logLevelThresholds[customConfigValue];
      this.#initialLogLevel = this.logLevel;

      return;
    }
    const envVarsValue = this.getEnvVarsService()?.getLogLevel()?.toUpperCase();
    if (this.isValidLogLevel(envVarsValue)) {
      this.logLevel = this.logLevelThresholds[envVarsValue];
      this.#initialLogLevel = this.logLevel;

      return;
    }
  }

  /**
   * Set the sample rate value with the following priority:
   * 1. Constructor value
   * 2. Custom config service value
   * 3. Environment variable value
   * 4. Default value (zero)
   *
   * @private
   * @param {number} [sampleRateValue] - The sample rate value
   */
  private setInitialSampleRate(sampleRateValue?: number): void {
    this.powertoolsLogData.sampleRateValue = 0;
    const constructorValue = sampleRateValue;
    const customConfigValue =
      this.getCustomConfigService()?.getSampleRateValue();
    const envVarsValue = this.getEnvVarsService().getSampleRateValue();
    for (const value of [constructorValue, customConfigValue, envVarsValue]) {
      if (this.isValidSampleRate(value)) {
        this.powertoolsLogData.sampleRateValue = value;

        if (
          this.logLevel > this.logLevelThresholds.DEBUG &&
          value &&
          randomInt(0, 100) / 100 <= value
        ) {
          // only change logLevel if higher than debug, i.e. don't change from e.g. tracing to debug
          this.setLogLevel('DEBUG');
          this.debug('Setting log level to DEBUG due to sampling rate');
        } else {
          this.setLogLevel(
            this.getLogLevelNameFromNumber(this.#initialLogLevel)
          );
        }

        return;
      }
    }
  }

  /**
   * If the log event feature is enabled via env variable, it sets a property that tracks whether
   * the event passed to the Lambda function handler should be logged or not.
   *
   * @private
   */
  private setLogEvent(): void {
    if (this.getEnvVarsService().getLogEvent()) {
      this.logEvent = true;
    }
  }

  /**
   * Set the log formatter instance, in charge of giving a custom format
   * to the structured logs, and optionally the ordering for keys within logs.
   *
   * @private
   * @param {LogFormatterInterface} logFormatter - The log formatter
   * @param {LogRecordOrder} logRecordOrder - Optional list of keys to specify order in logs
   */
  private setLogFormatter(
    logFormatter?: LogFormatterInterface,
    logRecordOrder?: LogRecordOrder
  ): void {
    this.logFormatter =
      logFormatter ??
      new PowertoolsLogFormatter({
        envVarsService: this.getEnvVarsService(),
        logRecordOrder,
      });
  }

  /**
   * If the `POWERTOOLS_DEV` env variable is set,
   * add JSON indentation for pretty printing logs.
   *
   * @private
   */
  private setLogIndentation(): void {
    if (this.getEnvVarsService().isDevMode()) {
      this.logIndentation = LogJsonIndent.PRETTY;
    }
  }

  /**
   * Configure the Logger instance settings that will affect the Logger's behaviour
   * and the content of all logs.
   *
   * @private
   * @param options - Options to configure the Logger instance
   */
  private setOptions(
    options: Omit<ConstructorOptions, 'customConfigService'>
  ): this {
    const {
      logLevel,
      serviceName,
      sampleRateValue,
      logFormatter,
      persistentKeys,
      persistentLogAttributes, // deprecated in favor of persistentKeys
      environment,
      jsonReplacerFn,
      logRecordOrder,
    } = options;

    if (persistentLogAttributes && persistentKeys) {
      this.warn(
        'Both persistentLogAttributes and persistentKeys options were provided. Using persistentKeys as persistentLogAttributes is deprecated and will be removed in future releases'
      );
    }

    // configurations that affect log content
    this.setPowertoolsLogData(
      serviceName,
      environment,
      persistentKeys || persistentLogAttributes
    );

    // configurations that affect Logger behavior
    this.setLogEvent();
    this.setInitialLogLevel(logLevel);
    this.setInitialSampleRate(sampleRateValue);

    // configurations that affect how logs are printed
    this.setLogFormatter(logFormatter, logRecordOrder);
    this.setConsole();
    this.setLogIndentation();
    this.#jsonReplacerFn = jsonReplacerFn;

    return this;
  }

  /**
   * Add important data to the Logger instance that will affect the content of all logs.
   *
   * @param {string} serviceName - The service name
   * @param {Environment} environment - The environment
   * @param {LogAttributes} persistentLogAttributes - The persistent log attributes
   * @private
   */
  private setPowertoolsLogData(
    serviceName?: string,
    environment?: Environment,
    persistentLogAttributes: LogAttributes = {}
  ): void {
    this.addToPowertoolsLogData({
      awsRegion: this.getEnvVarsService().getAwsRegion(),
      environment:
        environment ||
        this.getCustomConfigService()?.getCurrentEnvironment() ||
        this.getEnvVarsService().getCurrentEnvironment(),
      serviceName:
        serviceName ||
        this.getCustomConfigService()?.getServiceName() ||
        this.getEnvVarsService().getServiceName() ||
        this.getDefaultServiceName(),
    });
    this.appendPersistentKeys(persistentLogAttributes);
  }
}

export { Logger };
