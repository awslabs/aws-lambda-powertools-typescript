import { LogLevel } from './constants.js';
import type { FunctionLog } from './types.js';

const CloudWatchLogKeywords = {
  END: 'END RequestId',
  INIT_START: 'INIT_START',
  REPORT: 'REPORT RequestId',
  START: 'START RequestId',
  XRAY: 'XRAY TraceId',
} as const;

class TestInvocationLogs {
  public static readonly LEVEL = LogLevel;

  /**
   * Array of logs from invocation.
   *
   * The first element is START, and the last two elements are END, and REPORT.
   *    [
   *      'START RequestId: c6af9ac6-7b61-11e6-9a41-93e812345678 Version: $LATEST',
   *      '{"cold_start":true,"function_arn":"arn:aws:lambda:eu-west-1:561912387782:function:loggerMiddyStandardFeatures-c555a2ec-1121-4586-9c04-185ab36ea34c","function_memory_size":128,"function_name":"loggerMiddyStandardFeatures-c555a2ec-1121-4586-9c04-185ab36ea34c","function_request_id":"7f586697-238a-4c3b-9250-a5f057c1119c","level":"INFO","message":"This is an INFO log with some context and persistent key","service":"logger-e2e-testing","timestamp":"2022-01-27T16:04:39.323Z","persistentKey":"works"}',
   *      '{"cold_start":true,"function_arn":"arn:aws:lambda:eu-west-1:561912387782:function:loggerMiddyStandardFeatures-c555a2ec-1121-4586-9c04-185ab36ea34c","function_memory_size":128,"function_name":"loggerMiddyStandardFeatures-c555a2ec-1121-4586-9c04-185ab36ea34c","function_request_id":"7f586697-238a-4c3b-9250-a5f057c1119c","level":"INFO","message":"This is an INFO log with some context","service":"logger-e2e-testing","timestamp":"2022-01-27T16:04:39.323Z","persistentKey":"works","additionalKey":"additionalValue"}',
   *      '{"cold_start":true,"function_arn":"arn:aws:lambda:eu-west-1:561912387782:function:loggerMiddyStandardFeatures-c555a2ec-1121-4586-9c04-185ab36ea34c","function_memory_size":128,"function_name":"loggerMiddyStandardFeatures-c555a2ec-1121-4586-9c04-185ab36ea34c","function_request_id":"7f586697-238a-4c3b-9250-a5f057c1119c","level":"ERROR","message":"There was an error","service":"logger-e2e-testing","timestamp":"2022-01-27T16:04:39.323Z","persistentKey":"works","error":{"name":"Error","location":"/var/task/index.js:2778","message":"you cannot prevent this","stack":"Error: you cannot prevent this\\n    at testFunction (/var/task/index.js:2778:11)\\n    at runRequest (/var/task/index.js:2314:36)"}}',
   *      'END RequestId: c6af9ac6-7b61-11e6-9a41-93e812345678',
   *      'REPORT RequestId: c6af9ac6-7b61-11e6-9a41-93e812345678\tDuration: 2.16 ms\tBilled Duration: 3 ms\tMemory Size: 128 MB\tMax Memory Used: 57 MB\t',
   *    ]
   * See https://docs.aws.amazon.com/lambda/latest/dg/nodejs-logging.html for details
   */
  private logs: string[];

  public constructor(logResult: string) {
    const rawLog = Buffer.from(logResult, 'base64').toString('utf-8').trim();
    this.logs = rawLog.split('\n');
  }

  /**
   * Test whether any of the function logs contain the provided text or regex.
   *
   * @param needle - text or regex to search for in the logs
   * @param levelToFilter - level to filter
   */
  public doesAnyFunctionLogsContains(
    needle: string | RegExp,
    levelToFilter?: keyof typeof LogLevel
  ): boolean {
    const filteredLogs = this.getFunctionLogs(levelToFilter).filter((log) =>
      typeof needle === 'string' ? log.includes(needle) : needle.test(log)
    );

    return filteredLogs.length > 0;
  }

  /**
   * Return all the log of the function
   * @returns Array of function logs
   */
  public getAllFunctionLogs(): string[] {
    return this.logs;
  }

  /**
   * Return the index of the log that contains `END RequestId`
   * @param logs
   * @returns {number} index of the log that contains END RequestId
   */
  public static getEndLogIndex(logs: string[]): number {
    return logs.findIndex((log) => log.startsWith(CloudWatchLogKeywords.END));
  }

  /**
   * Return only logs from function, exclude INIT_START, START, END, REPORT,
   * and X-Ray log generated by the Lambda service.
   *
   * @param {typeof LogLevel} [levelToFilter] - Level to filter the logs
   * @returns Array of function logs, filtered by level if provided
   */
  public getFunctionLogs(levelToFilter?: keyof typeof LogLevel): string[] {
    const exclusionKeywords = Object.values(CloudWatchLogKeywords);
    let filteredLogs = this.logs.filter(
      (log) => !exclusionKeywords.some((keyword) => log.startsWith(keyword))
    );

    if (levelToFilter) {
      filteredLogs = filteredLogs.filter((log) => {
        try {
          const parsedLog = TestInvocationLogs.parseFunctionLog(log);

          return parsedLog.level === levelToFilter;
        } catch (error) {
          // If log is not from structured logging : such as metrics one.
          return (
            (log.split('\t')[2] as keyof typeof LogLevel) === levelToFilter
          );
        }
      });
    }

    return filteredLogs;
  }

  /**
   * Return the index of the log that contains `INIT_START`
   * @param logs
   * @returns {number} index of the log that contains `INIT_START`
   */
  public static getInitLogIndex(logs: string[]): number {
    return logs.findIndex((log) =>
      log.startsWith(CloudWatchLogKeywords.INIT_START)
    );
  }

  /**
   * Return the log that contains the report of the function `REPORT RequestId`
   */
  public getReportLog(): string {
    const endLogIndex = TestInvocationLogs.getReportLogIndex(this.logs);

    return this.logs[endLogIndex];
  }

  /**
   * Return the index of the log that contains `REPORT RequestId`
   * @param logs
   * @returns {number} index of the log that contains `REPORT RequestId`
   */
  public static getReportLogIndex(logs: string[]): number {
    return logs.findIndex((log) =>
      log.startsWith(CloudWatchLogKeywords.REPORT)
    );
  }

  /**
   * Return the index of the log that contains `START RequestId`
   * @param logs
   * @returns {number} index of the log that contains `START RequestId`
   */
  public static getStartLogIndex(logs: string[]): number {
    return logs.findIndex((log) => log.startsWith(CloudWatchLogKeywords.START));
  }

  /**
   * Return the index of the log that contains `XRAY TraceId`
   * @param logs
   * @returns {number} index of the log that contains `XRAY TraceId`
   */
  public static getXRayLogIndex(logs: string[]): number {
    return logs.findIndex((log) => log.startsWith(CloudWatchLogKeywords.XRAY));
  }

  /**
   * Each of log message contains a JSON with the structured Log object (e.g. {\"cold_start\":true, ..})
   * @param log
   */
  public static parseFunctionLog(log: string): FunctionLog {
    return JSON.parse(log);
  }
}

export { TestInvocationLogs };
