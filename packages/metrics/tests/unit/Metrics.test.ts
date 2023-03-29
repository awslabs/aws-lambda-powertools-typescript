/**
 * Test Metrics class
 *
 * @group unit/metrics/class
 */

import { MetricResolution, MetricUnits, Metrics } from '../../src/';

describe('Class: Metrics', () => {
  const ENVIRONMENT_VARIABLES = process.env;

  beforeAll(() => {
    process.env = { ...ENVIRONMENT_VARIABLES };
  });

  describe('Method: addMetric', () => {
    
    test('when called, it should store metrics', () => {
      
      //Prepare
      const metrics = new Metrics();
      const metricName = 'test_metric';

      //Act
      metrics.addMetric(metricName, MetricUnits.Count, 1, MetricResolution.High);

      // Assess
      expect(metrics).toEqual(expect.objectContaining({
        storedMetrics: {
          [metricName]: {
            name: metricName,
            resolution: MetricResolution.High,
            unit: MetricUnits.Count,
            value: 1
          }
        },
      }));
    });

    test('when called with multiple metric name, it should store multiple metrics', () => {
      
      //Prepare
      const metrics = new Metrics();

      //Act
      metrics.addMetric('test_metric-1', MetricUnits.Count, 1, MetricResolution.High);
      metrics.addMetric('test_metric-2', MetricUnits.Count, 3, MetricResolution.High);
      metrics.addMetric('test_metric-3', MetricUnits.Count, 6, MetricResolution.High);

      // Assess
      expect(metrics).toEqual(expect.objectContaining({
        storedMetrics: {
          'test_metric-1': {
            name: 'test_metric-1',
            resolution: MetricResolution.High,
            unit: MetricUnits.Count,
            value: 1
          },
          'test_metric-2': {
            name: 'test_metric-2',
            resolution: MetricResolution.High,
            unit: MetricUnits.Count,
            value: 3
          },
          'test_metric-3': {
            name: 'test_metric-3',
            resolution: MetricResolution.High,
            unit: MetricUnits.Count,
            value: 6
          }
        },
      }));
    });

    test('when called without resolution, it should store metrics with standard resolution', () => {
   
      //Prepare
      const metrics = new Metrics();

      //Act
      metrics.addMetric('test-metric-1', MetricUnits.Count, 1);
      metrics.addMetric('test-metric-2', MetricUnits.Seconds, 3);

      // Assess
      expect(metrics).toEqual(expect.objectContaining({
        storedMetrics: {
          'test-metric-1': {
            name: 'test-metric-1',
            resolution: MetricResolution.Standard,
            unit: MetricUnits.Count,
            value: 1
          },
          'test-metric-2': {
            name: 'test-metric-2',
            resolution: MetricResolution.Standard,
            unit: MetricUnits.Seconds,
            value: 3
          }
        },
      }));
    });

    test('when trying to add metric with the same name multiple times, values should be grouped together in an array', () => {

      //Prepare
      const metrics = new Metrics();
      const metricName = 'test-metric';

      //Act
      metrics.addMetric(metricName, MetricUnits.Count, 1);
      metrics.addMetric(metricName, MetricUnits.Count, 5);
      metrics.addMetric(metricName, MetricUnits.Count, 1);
      metrics.addMetric(metricName, MetricUnits.Count, 4);
      
      // Assess
      expect(metrics).toEqual(expect.objectContaining({
        storedMetrics: {
          [metricName]: {
            name: metricName,
            resolution: MetricResolution.Standard,
            unit: MetricUnits.Count,
            value: [ 1, 5, 1, 4 ]
          }
        },
      }));
    });

    test('when trying to add metric with the same name multiple times but with different unit, it will throw an error', () => {

      //Prepare
      const metrics = new Metrics();
      const metricName = 'test-metric';

      // Act & Assess
      expect(() => {
        metrics.addMetric(metricName, MetricUnits.Count, 1);
        metrics.addMetric(metricName, MetricUnits.Kilobits, 5);
      }).toThrowError(Error);

    });

    test('it will publish metrics if stored metrics count has reached max metric size threshold', () => {
        
      //Prepare
      const metrics = new Metrics();
      const publishStoredMetricsSpy = jest.spyOn(metrics, 'publishStoredMetrics');
      const metricName = 'test-metric';
        
      //Act
      for (let i = 0; i <= 100; i++) {
        metrics.addMetric(`${metricName}-${i}`, MetricUnits.Count, i);
      }
  
      // Assess
      expect(publishStoredMetricsSpy).toHaveBeenCalledTimes(1);

    });

    test('it will not publish metrics if stored metrics count has not reached max metric size threshold', () => {
        
      //Prepare
      const metrics = new Metrics();
      const publishStoredMetricsSpy = jest.spyOn(metrics, 'publishStoredMetrics');
      const metricName = 'test-metric';
        
      //Act
      for (let i = 0; i < 100; i++) {
        metrics.addMetric(`${metricName}-${i}`, MetricUnits.Count, i);
      }
  
      // Assess
      expect(publishStoredMetricsSpy).toHaveBeenCalledTimes(0);

    });
  });

  describe('Method: addDimension', () => {
    
    test('when called, it should store dimensions', () => {
        
      //Prepare
      const metrics = new Metrics();
      const dimensionName = 'test-dimension';
      const dimensionValue= 'test-value';
  
      //Act
      metrics.addDimension(dimensionName, dimensionValue);
  
      // Assess
      expect(metrics).toEqual(expect.objectContaining({
        dimensions: {
          [dimensionName]: dimensionValue
        },
      }));
      
    });

    test('it should throw error if number of dimensions exceeds the maximum allowed', () => {
        
      //Prepare
      const metrics = new Metrics();
      const dimensionName = 'test-dimension';
      const dimensionValue = 'test-value';
  
      // Act & Assess
      expect(() => {
        for (let i = 0; i < 29; i++) {
          metrics.addDimension(`${dimensionName}-${i}`, `${dimensionValue}-${i}`);
        }
      }).toThrowError(RangeError);
      
    });

    test('it should take consideration of defaultDimensions while throwing error if number of dimensions exceeds the maximum allowed', () => {
        
      //Prepare
      const metrics = new Metrics({ defaultDimensions: { 'environment': 'prod', 'foo': 'bar' } });
      const dimensionName = 'test-dimension';
      const dimensionValue = 'test-value';
  
      // Act & Assess
      expect(() => {
        for (let i = 0; i < 27; i++) {
          metrics.addDimension(`${dimensionName}-${i}`, `${dimensionValue}-${i}`);
        }
      }).toThrowError(RangeError);

    });

  });

  describe('Method: addDimensions', () => {
      
    test('it should add multiple dimensions', () => {
      
      //Prepare
      const dimensionsToBeAdded: { [key: string]: string } = {
        'test-dimension-1': 'test-value-1',
        'test-dimension-2': 'test-value-2',
      };
      const metrics = new Metrics();

      //Act
      metrics.addDimensions(dimensionsToBeAdded);

      // Assess
      expect(metrics).toEqual(expect.objectContaining({
        dimensions: dimensionsToBeAdded
      }));

    });

    test('if same dimension is added again, it should update existing dimension value', () => {
      
      //Prepare
      const dimensionsToBeAdded: { [key: string]: string } = {
        'test-dimension-1': 'test-value-1',
        'test-dimension-2': 'test-value-2',
      };
      const metrics = new Metrics();

      //Act
      metrics.addDimensions(dimensionsToBeAdded);
      metrics.addDimensions({ 'test-dimension-1': 'test-value-3' });

      // Assess
      expect(metrics).toEqual(expect.objectContaining({
        dimensions: {
          'test-dimension-1': 'test-value-3',
          'test-dimension-2': 'test-value-2',
        }
      }));

    });

    test('it should throw error if number of dimensions exceeds the maximum allowed', () => {
        
      //Prepare
      const metrics = new Metrics();
      const dimensionName = 'test-dimension';
      const dimensionValue = 'test-value';
      const dimensionsToBeAdded: { [key: string]: string } = {};
      for (let i = 0; i <= 29; i++) {
        dimensionsToBeAdded[`${dimensionName}-${i}`] = `${dimensionValue}-${i}`;
      }
     
      // Act & Assess
      expect(() => {
        metrics.addDimensions(dimensionsToBeAdded);
      }).toThrowError(RangeError);
      
    });

    test('it should successfully add up to maximum allowed dimensions without throwing error', () => {
        
      //Prepare
      const metrics = new Metrics();
      const dimensionName = 'test-dimension';
      const dimensionValue = 'test-value';
      const dimensionsToBeAdded: { [key: string]: string } = {};
      for (let i = 0; i < 29; i++) {
        dimensionsToBeAdded[`${dimensionName}-${i}`] = `${dimensionValue}-${i}`;
      }
     
      // Act & Assess
      expect(() => {
        metrics.addDimensions(dimensionsToBeAdded);
      }).not.toThrowError(RangeError);
      expect(metrics).toEqual(expect.objectContaining({ dimensions: dimensionsToBeAdded }));
      
    });
    
  });
});
