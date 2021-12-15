import { MetricUnit, EmfOutput, HandlerMethodDecorator, Dimensions, DecoratorOptions } from './types';
import { Metrics } from './Metrics';

interface MetricsInterface {
  addDimension(name: string, value: string): void;
  addDimensions(dimensions: {[key: string]: string}): void;
  addMetadata(key: string, value: string): void;
  addMetric(name: string, unit:MetricUnit, value:number): void;
  clearDimensions(): void;
  clearMetadata(): void;
  clearMetrics(): void;
  clearDefaultDimensions(): void;
  logMetrics(options?: DecoratorOptions): HandlerMethodDecorator;
  purgeStoredMetrics(): void;
  serializeMetrics(): EmfOutput;
  setDefaultDimensions(dimensions: Dimensions | undefined): void;
  singleMetric(): Metrics;
}

export {
  MetricsInterface,
};