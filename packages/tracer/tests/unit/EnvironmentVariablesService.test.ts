import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvironmentVariablesService } from '../../src/config/EnvironmentVariablesService.js';

describe('Class: EnvironmentVariablesService', () => {
  const ENVIRONMENT_VARIABLES = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ENVIRONMENT_VARIABLES };
  });

  afterAll(() => {
    process.env = ENVIRONMENT_VARIABLES;
  });

  describe('Method: getTracingEnabled', () => {
    it('returns the value of the environment variable POWERTOOLS_TRACE_ENABLED', () => {
      // Prepare
      process.env.POWERTOOLS_TRACE_ENABLED = 'false';
      const service = new EnvironmentVariablesService();

      // Act
      const value = service.getTracingEnabled();

      // Assess
      expect(value).toEqual('false');
    });
  });

  describe('Method: getTracingCaptureResponse', () => {
    it('returns the value of the environment variable POWERTOOLS_TRACER_CAPTURE_RESPONSE', () => {
      // Prepare
      process.env.POWERTOOLS_TRACER_CAPTURE_RESPONSE = 'false';
      const service = new EnvironmentVariablesService();

      // Act
      const value = service.getTracingCaptureResponse();

      // Assess
      expect(value).toEqual('false');
    });
  });

  describe('Method: getTracingCaptureError', () => {
    it('returns the value of the environment variable POWERTOOLS_TRACER_CAPTURE_ERROR', () => {
      // Prepare
      process.env.POWERTOOLS_TRACER_CAPTURE_ERROR = 'false';
      const service = new EnvironmentVariablesService();

      // Act
      const value = service.getTracingCaptureError();

      // Assess
      expect(value).toEqual('false');
    });
  });

  describe('Method: getCaptureHTTPsRequests', () => {
    it('returns the value of the environment variable POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS', () => {
      // Prepare
      process.env.POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS = 'false';
      const service = new EnvironmentVariablesService();

      // Act
      const value = service.getCaptureHTTPsRequests();

      // Assess
      expect(value).toEqual('false');
    });
  });

  describe('Method: getSamLocal', () => {
    it('returns the value of the environment variable AWS_SAM_LOCAL', () => {
      // Prepare
      process.env.AWS_SAM_LOCAL = 'true';
      const service = new EnvironmentVariablesService();

      // Act
      const value = service.getSamLocal();

      // Assess
      expect(value).toEqual('true');
    });
  });

  describe('Method: getAwsExecutionEnv', () => {
    it('returns the value of the environment variable AWS_EXECUTION_ENV', () => {
      // Prepare
      process.env.AWS_EXECUTION_ENV = 'nodejs20.x';
      const service = new EnvironmentVariablesService();

      // Act
      const value = service.getAwsExecutionEnv();

      // Assess
      expect(value).toEqual('nodejs20.x');
    });
  });
});
