import { LogAttributes } from '../types';

interface LoggerInterface {

  debug(message: string, attributes?: LogAttributes): void

  error(message: string, attributes?: LogAttributes): void

  info(message: string, attributes?: LogAttributes): void

  warn(message: string, attributes?: LogAttributes): void

}

export {
  LoggerInterface
};