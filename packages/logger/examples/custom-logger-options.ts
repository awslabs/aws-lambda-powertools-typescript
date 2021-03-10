/* eslint-disable sort-keys */
process.env._X_AMZN_TRACE_ID = 'abcdef123456abcdef123456abcdef123456';
process.env.AWS_LAMBDA_FUNCTION_NAME = 'my-lambda-function';
process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '128';
process.env.AWS_REGION = 'eu-central-1';
process.env.CUSTOM_ENV = 'prod';

import * as dummyEvent from '../../../tests/resources/events/custom/hello-world.json';
import { CustomConfigService } from './config/CustomConfigService';
import { CustomLogFormatter } from './formatters/CustomLogFormatter';
import { context as dummyContext } from '../../../tests/resources/contexts/hello-world';
import { Handler } from 'aws-lambda';
import { Logger } from '../src';

const logger = new Logger({
  logLevel: 'WARN',
  serviceName: 'foo-bar',
  sampleRateValue: 0.00001,
  logFormatter: new CustomLogFormatter(),
  customConfigService: new CustomConfigService(), // This could be used for AppConfig
  customAttributes: {
    awsAccountId: '123456789012',
    logger: {
      name: 'aws-lambda-powertools-typescript',
      version: 'v0.1.3'
    }
  }
});

const lambdaHandler: Handler = async (event, context) => {
  logger.addContext(context);

  logger.debug('This is a DEBUG log', { correlationIds: { myCustomCorrelationId: 'foo-bar-baz' } });
  logger.info('This is an INFO log', { correlationIds: { myCustomCorrelationId: 'foo-bar-baz' } });
  logger.warn('This is a WARN log', { correlationIds: { myCustomCorrelationId: 'foo-bar-baz' } });
  logger.error('This is an ERROR log', { correlationIds: { myCustomCorrelationId: 'foo-bar-baz' } });

  return {
    foo: 'bar'
  };

};

lambdaHandler(dummyEvent, dummyContext, () => {});

/**
 * Sample output:
 *
 * {
 *   message: 'This is an ERROR log',
 *   service: 'foo-bar',
 *   environment: 'prod',
 *   awsRegion: 'eu-central-1',
 *   correlationIds: {
 *     awsRequestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
 *     xRayTraceId: 'abcdef123456abcdef123456abcdef123456',
 *     myCustomCorrelationId: 'foo-bar-baz'
 *   },
 *   lambdaFunction: {
 *     name: 'foo-bar-function',
 *     arn: 'arn:aws:lambda:eu-central-1:123456789012:function:Example',
 *     memoryLimitInMB: 128,
 *     version: '$LATEST',
 *     coldStart: undefined
 *   },
 *   logLevel: 'ERROR',
 *   timestamp: '2021-03-10T18:47:04.724Z',
 *   logger: {
 *     name: '@aws-lambda-powertools/logger',
 *     version: '0.0.0',
 *     level: 'ERROR',
 *     sampleRateValue: 0.00001
 *   }
 * }
 *
 **/
