import { LogAttributes, LogLevel, LoggerOptions } from '../types/Log';
import { LoggerInterface } from '.';
import { LogData } from './LogData';
import { EnvironmentConfigService } from './EnvironmentConfigService';
import { ConfigServiceInterface } from './ConfigServiceInterface';
import { LogSchemaInterface } from './schemas/LogSchemaInterface';
import { PowertoolLogSchema } from './schemas/PowertoolLogSchema';

class Logger implements LoggerInterface {

  private configService: ConfigServiceInterface;

  private defaultLogAttributes: LogAttributes;

  private readonly serviceName: string;
  private readonly sampleRate: number;
  private readonly logLevel: LogLevel;
  private logEvent: boolean;
  private logSchema: LogSchemaInterface;

  public constructor(options: LoggerOptions = {}) {
    const { logLevel, serviceName, sampleRate, logEvent, logSchema, config, defaultAttributes } = options;

    this.configService = config || new EnvironmentConfigService();

    this.logLevel = logLevel || this.configService.getLogLevel() as LogLevel;
    this.serviceName = serviceName || this.configService.getServiceName();
    this.sampleRate = sampleRate || Number(this.configService.getSampleRate()) || 1;
    this.logEvent = logEvent || this.configService.getLogEvent();

    this.logSchema = logSchema || new PowertoolLogSchema();

    this.defaultLogAttributes = {
      [this.logSchema.getLogLevelKey()]: this.logLevel,
      [this.logSchema.getServiceNameKey()]: this.serviceName,
      [this.logSchema.getSampleRateKey()]: this.sampleRate,
      [this.logSchema.getXrayTraceIdKey()]: this.configService.getXrayTraceId(),
      [this.logSchema.getFunctionNameKey()]: this.configService.getFunctionName(),
      [this.logSchema.getFunctionMemorySizeKey()]: this.configService.getFunctionMemory(),
      [this.logSchema.getSourceCodeLocationKey()]: 'foo', // TODO
      [this.logSchema.getColdStartKey()]: 'foo', // TODO
      [this.logSchema.getFunctionArnKey()]: 'foo', // TODO
      [this.logSchema.getFunctionRequestIdKey()]: 'foo', // TODO
      ...defaultAttributes
    };
  }

  public debug(message: string, attributes: LogAttributes = {}): void {
    this.printLog(this.getLogData('DEBUG', message, attributes).getAttributes());
  }

  public info(message: string, attributes: LogAttributes = {}): void {
    this.printLog(this.getLogData('INFO', message, attributes).getAttributes());
  }

  public warn(message: string, attributes: LogAttributes = {}): void {
    this.printLog(this.getLogData('WARN', message, attributes).getAttributes());
  }

  public error(message: string, attributes: LogAttributes = {}): void {
    this.printLog(this.getLogData('ERROR', message, attributes).getAttributes());
  }

  private getLogData(logLevel: LogLevel, message: string, attributes: LogAttributes = {}): LogData {
    return new LogData(this.defaultLogAttributes)
      .addAttributes( {
        [this.logSchema.getMessageKey()]: message,
        [this.logSchema.getTimestampKey()]: this.getCurrentTimestamp(),
        [this.logSchema.getLogLevelKey()]: logLevel,
        ...attributes
      });
  }

  private printLog(log: LogAttributes): void {
    console.log(log);
  }

  private getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

}

export {
  Logger
};