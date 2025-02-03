import { createHash } from 'node:crypto';
import context from '@aws-lambda-powertools/testing-utils/context';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  IdempotencyConfig,
  IdempotencyItemAlreadyExistsError,
  IdempotencyKeyError,
  IdempotencyRecordStatus,
  IdempotencyValidationError,
} from '../../../src/index.js';
import { IdempotencyRecord } from '../../../src/persistence/index.js';
import type { IdempotencyConfigOptions } from '../../../src/types/index.js';
import { PersistenceLayerTestClass } from '../../helpers/idempotencyUtils.js';

vi.mock('node:crypto', () => ({
  createHash: vi.fn().mockReturnValue({
    update: vi.fn(),
    digest: vi.fn().mockReturnValue('mocked-hash'),
  }),
}));

describe('Class: BasePersistenceLayer', () => {
  const ENVIRONMENT_VARIABLES = process.env;

  beforeAll(() => {
    vi.useFakeTimers().setSystemTime(new Date());
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...ENVIRONMENT_VARIABLES };
  });

  afterAll(() => {
    process.env = ENVIRONMENT_VARIABLES;
    vi.useRealTimers();
  });

  describe('Method: constructor', () => {
    it('initializes with default values', () => {
      // Prepare & Act
      const persistenceLayer = new PersistenceLayerTestClass();

      // Assess
      expect(persistenceLayer.idempotencyKeyPrefix).toBe('my-lambda-function');
      expect(persistenceLayer).toEqual(
        expect.objectContaining({
          configured: false,
          expiresAfterSeconds: 3600,
          hashFunction: 'md5',
          payloadValidationEnabled: false,
          throwOnNoIdempotencyKey: false,
          useLocalCache: false,
        })
      );
    });
  });

  describe('Method: configure', () => {
    it('appends the function name to the idempotency key prefix', () => {
      // Prepare
      const config = new IdempotencyConfig({});
      const persistenceLayer = new PersistenceLayerTestClass();

      // Act
      persistenceLayer.configure({ config, functionName: 'my-function' });

      // Assess
      expect(persistenceLayer.idempotencyKeyPrefix).toBe(
        'my-lambda-function.my-function'
      );
    });

    it('should trim function name before appending as key prefix', () => {
      // Prepare
      const config = new IdempotencyConfig({});
      const persistenceLayer = new PersistenceLayerTestClass();

      // Act
      persistenceLayer.configure({ config, functionName: ' my-function ' });

      // Assess
      expect(persistenceLayer.idempotencyKeyPrefix).toBe(
        'my-lambda-function.my-function'
      );
    });

    it('appends custom prefix to the idempotence key prefix', () => {
      // Prepare
      const config = new IdempotencyConfig({});
      const persistenceLayer = new PersistenceLayerTestClass();

      // Act
      persistenceLayer.configure({ config, keyPrefix: 'my-custom-prefix' });

      // Assess
      expect(persistenceLayer.idempotencyKeyPrefix).toBe(
        'my-custom-prefix'
      );
    });

    it('uses default config when no option is provided', () => {
      // Prepare
      const config = new IdempotencyConfig({});
      const persistenceLayer = new PersistenceLayerTestClass();

      // Act
      persistenceLayer.configure({ config });

      // Assess
      expect(persistenceLayer).toEqual(
        expect.objectContaining({
          configured: true,
          validationKeyJmesPath: undefined,
          payloadValidationEnabled: false,
          expiresAfterSeconds: 3600,
          throwOnNoIdempotencyKey: false,
          eventKeyJmesPath: '',
          useLocalCache: false,
          hashFunction: 'md5',
        })
      );
    });

    it('initializes the persistence layer with the provided configs', () => {
      // Prepare
      const configOptions: IdempotencyConfigOptions = {
        eventKeyJmesPath: 'eventKeyJmesPath',
        payloadValidationJmesPath: 'payloadValidationJmesPath',
        throwOnNoIdempotencyKey: true,
        expiresAfterSeconds: 100,
        useLocalCache: true,
        maxLocalCacheSize: 300,
        hashFunction: 'hashFunction',
        lambdaContext: context,
      };
      const config = new IdempotencyConfig(configOptions);
      const persistenceLayer = new PersistenceLayerTestClass();

      // Act
      persistenceLayer.configure({ config });

      // Assess
      expect(persistenceLayer).toEqual(
        expect.objectContaining({
          configured: true,
          eventKeyJmesPath: 'eventKeyJmesPath',
          validationKeyJmesPath: 'payloadValidationJmesPath',
          payloadValidationEnabled: true,
          throwOnNoIdempotencyKey: true,
          expiresAfterSeconds: 100,
          useLocalCache: true,
          hashFunction: 'hashFunction',
        })
      );
    });

    it('returns the same config instance when called multiple times', () => {
      // Prepare
      const config = new IdempotencyConfig({
        eventKeyJmesPath: 'eventKeyJmesPath',
      });
      const secondConfig = new IdempotencyConfig({
        eventKeyJmesPath: 'secondEventKeyJmesPath',
      });
      const persistenceLayer = new PersistenceLayerTestClass();

      // Act
      persistenceLayer.configure({ config });
      persistenceLayer.configure({ config: secondConfig });

      // Assess
      expect(persistenceLayer).toEqual(
        expect.objectContaining({
          configured: true,
          eventKeyJmesPath: 'eventKeyJmesPath',
        })
      );
    });
  });

  describe('Method: deleteRecord', () => {
    it('calls the _deleteRecord method with the correct arguments', async () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      const baseIdempotencyRecord = new IdempotencyRecord({
        idempotencyKey: 'idempotencyKey',
        status: IdempotencyRecordStatus.EXPIRED,
      });
      const deleteRecordSpy = vi.spyOn(persistenceLayer, '_deleteRecord');

      // Act
      await persistenceLayer.deleteRecord({ foo: 'bar' });

      // Assess
      expect(deleteRecordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          ...baseIdempotencyRecord,
          idempotencyKey: 'my-lambda-function#mocked-hash',
          status: IdempotencyRecordStatus.EXPIRED,
        })
      );
    });

    it('it deletes the record from the local cache', async () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      persistenceLayer.configure({
        config: new IdempotencyConfig({
          useLocalCache: true,
        }),
      });
      const baseIdempotencyRecord = new IdempotencyRecord({
        idempotencyKey: 'idempotencyKey',
        status: IdempotencyRecordStatus.EXPIRED,
      });
      await persistenceLayer.saveSuccess({ foo: 'bar' }, { bar: 'baz' });
      const deleteRecordSpy = vi.spyOn(persistenceLayer, '_deleteRecord');

      // Act
      await persistenceLayer.deleteRecord({ foo: 'bar' });

      // Assess
      expect(deleteRecordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          ...baseIdempotencyRecord,
          idempotencyKey: 'my-lambda-function#mocked-hash',
          status: IdempotencyRecordStatus.EXPIRED,
        })
      );
    });
  });

  describe('Method: getRecord', () => {
    it('calls the _getRecord method with the correct arguments', async () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      persistenceLayer.configure({
        config: new IdempotencyConfig({
          eventKeyJmesPath: 'foo',
        }),
      });
      const getRecordSpy = vi.spyOn(persistenceLayer, '_getRecord');

      // Act
      await persistenceLayer.getRecord({ foo: 'bar' });

      // Assess
      expect(getRecordSpy).toHaveBeenCalledWith(
        'my-lambda-function#mocked-hash'
      );
    });

    it("throws an IdempotencyValidationError when the hashes don't match", async () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      persistenceLayer.configure({
        config: new IdempotencyConfig({
          payloadValidationJmesPath: 'foo',
        }),
      });
      const existingRecord = new IdempotencyRecord({
        idempotencyKey: 'my-lambda-function#mocked-hash',
        status: IdempotencyRecordStatus.INPROGRESS,
        payloadHash: 'different-hash',
      });
      vi.spyOn(persistenceLayer, '_getRecord').mockReturnValue(existingRecord);

      // Act & Assess
      await expect(persistenceLayer.getRecord({ foo: 'bar' })).rejects.toThrow(
        new IdempotencyValidationError(
          'Payload does not match stored record for this event key',
          existingRecord
        )
      );
    });

    it('logs a warning when the idempotency key cannot be found', async () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      persistenceLayer.configure({
        config: new IdempotencyConfig({
          // This will cause the hash generation to fail because the event does not have a bar property
          eventKeyJmesPath: 'bar',
        }),
      });
      const logWarningSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => ({}));

      // Act
      await persistenceLayer.getRecord({ foo: 'bar' });

      // Assess
      expect(logWarningSpy).toHaveBeenCalledWith(
        'No value found for idempotency_key. jmespath: bar'
      );
    });

    it('throws an error when throwOnNoIdempotencyKey is enabled and the key is not found', async () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      persistenceLayer.configure({
        config: new IdempotencyConfig({
          throwOnNoIdempotencyKey: true,
          // This will cause the hash generation to fail because the JMESPath expression will return an empty array
          eventKeyJmesPath: 'foo.bar',
        }),
      });

      // Act & Assess
      await expect(
        persistenceLayer.getRecord({ foo: { bar: [] } })
      ).rejects.toThrow(
        new IdempotencyKeyError(
          'No data found to create a hashed idempotency_key'
        )
      );
    });

    it('uses the record from the local cache when called multiple times', async () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      persistenceLayer.configure({
        config: new IdempotencyConfig({
          useLocalCache: true,
        }),
      });
      const getRecordSpy = vi
        .spyOn(persistenceLayer, '_getRecord')
        .mockReturnValue(
          new IdempotencyRecord({
            idempotencyKey: 'my-lambda-function#mocked-hash',
            status: IdempotencyRecordStatus.COMPLETED,
            payloadHash: 'different-hash',
          })
        );

      // Act
      await persistenceLayer.getRecord({ foo: 'bar' });
      await persistenceLayer.getRecord({ foo: 'bar' });

      // Assess
      expect(getRecordSpy).toHaveBeenCalledTimes(1);
    });

    it('loads the value from the persistence layer when the record in the local cache has expired', async () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      persistenceLayer.configure({
        config: new IdempotencyConfig({
          useLocalCache: true,
        }),
      });
      const getRecordSpy = vi
        .spyOn(persistenceLayer, '_getRecord')
        .mockReturnValue(
          new IdempotencyRecord({
            idempotencyKey: 'my-lambda-function#mocked-hash',
            status: IdempotencyRecordStatus.EXPIRED,
            payloadHash: 'different-hash',
            expiryTimestamp: Date.now() / 1000 - 1,
          })
        );

      // Act
      await persistenceLayer.getRecord({ foo: 'bar' });
      await persistenceLayer.getRecord({ foo: 'bar' });

      // Assess
      expect(getRecordSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Method: saveInProgress', () => {
    it('calls the _putRecord method with the correct arguments', async () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      const putRecordSpy = vi.spyOn(persistenceLayer, '_putRecord');
      const remainingTimeInMs = 2000;

      // Act
      await persistenceLayer.saveInProgress({ foo: 'bar' }, remainingTimeInMs);

      // Assess
      expect(putRecordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'my-lambda-function#mocked-hash',
          status: IdempotencyRecordStatus.INPROGRESS,
          expiryTimestamp: Math.round(Date.now() / 1000 + 3600),
          payloadHash: '',
          inProgressExpiryTimestamp: Date.now() + remainingTimeInMs,
          responseData: undefined,
        })
      );
    });

    it('logs a warning when unable to call remainingTimeInMillis() from the context', async () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      const putRecordSpy = vi.spyOn(persistenceLayer, '_putRecord');
      const logWarningSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => ({}));

      // Act
      await persistenceLayer.saveInProgress({ foo: 'bar' });

      // Assess
      expect(putRecordSpy).toHaveBeenCalledTimes(1);
      expect(logWarningSpy).toHaveBeenCalledWith(
        'Could not determine remaining time left. Did you call registerLambdaContext on IdempotencyConfig?'
      );
    });

    it('throws an `IdempotencyItemAlreadyExistsError` when there is already a completed record in the cache', async () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      persistenceLayer.configure({
        config: new IdempotencyConfig({
          useLocalCache: true,
        }),
      });
      const putRecordSpy = vi.spyOn(persistenceLayer, '_putRecord');
      await persistenceLayer.saveSuccess({ foo: 'bar' }, { bar: 'baz' });

      // Act & Assess
      expect(putRecordSpy).toHaveBeenCalledTimes(0);
      try {
        await persistenceLayer.saveInProgress({ foo: 'bar' });
      } catch (error) {
        if (error instanceof IdempotencyItemAlreadyExistsError) {
          expect(error.existingRecord).toEqual(
            expect.objectContaining({
              idempotencyKey: 'my-lambda-function#mocked-hash',
              status: IdempotencyRecordStatus.COMPLETED,
            })
          );
        }
      }
      expect.assertions(2);
    });
  });

  describe('Method: saveSuccess', () => {
    it('calls the _updateRecord method with the correct arguments', async () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      const updateRecordSpy = vi.spyOn(persistenceLayer, '_updateRecord');
      const result = { bar: 'baz' };

      // Act
      await persistenceLayer.saveSuccess({ foo: 'bar' }, result);

      // Assess
      expect(updateRecordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'my-lambda-function#mocked-hash',
          status: IdempotencyRecordStatus.COMPLETED,
          expiryTimestamp: Math.round(Date.now() / 1000 + 3600),
          payloadHash: '',
          inProgressExpiryTimestamp: undefined,
          responseData: result,
        })
      );
    });
  });

  describe('Method: processExistingRecord', () => {
    it('throws an error if the payload does not match the stored record', () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      persistenceLayer.configure({
        config: new IdempotencyConfig({
          payloadValidationJmesPath: 'foo',
        }),
      });
      const existingRecord = new IdempotencyRecord({
        idempotencyKey: 'my-lambda-function#mocked-hash',
        status: IdempotencyRecordStatus.INPROGRESS,
        payloadHash: 'different-hash',
      });

      // Act & Assess
      expect(() =>
        persistenceLayer.processExistingRecord(existingRecord, { foo: 'bar' })
      ).toThrow(
        new IdempotencyValidationError(
          'Payload does not match stored record for this event key',
          existingRecord
        )
      );
    });

    it('returns if the payload matches the stored record', () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      persistenceLayer.configure({
        config: new IdempotencyConfig({
          payloadValidationJmesPath: 'foo',
          useLocalCache: true,
        }),
      });
      const existingRecord = new IdempotencyRecord({
        idempotencyKey: 'my-lambda-function#mocked-hash',
        status: IdempotencyRecordStatus.INPROGRESS,
        payloadHash: 'mocked-hash',
      });

      // Act & Assess
      expect(() =>
        persistenceLayer.processExistingRecord(existingRecord, { foo: 'bar' })
      ).not.toThrow();
    });

    it('skips validation if payload validation is not enabled', () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      const existingRecord = new IdempotencyRecord({
        idempotencyKey: 'my-lambda-function#mocked-hash',
        status: IdempotencyRecordStatus.INPROGRESS,
        payloadHash: 'different-hash',
      });

      // Act & Assess
      expect(() =>
        persistenceLayer.processExistingRecord(existingRecord, { foo: 'bar' })
      ).not.toThrow();
    });

    it('skips hashing if the payload is already an IdempotencyRecord', () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();
      persistenceLayer.configure({
        config: new IdempotencyConfig({
          payloadValidationJmesPath: 'foo',
        }),
      });
      const existingRecord = new IdempotencyRecord({
        idempotencyKey: 'my-lambda-function#mocked-hash',
        status: IdempotencyRecordStatus.INPROGRESS,
        payloadHash: 'mocked-hash',
      });
      const payload = new IdempotencyRecord({
        idempotencyKey: 'my-lambda-function#mocked-hash',
        status: IdempotencyRecordStatus.INPROGRESS,
        payloadHash: 'mocked-hash',
      });

      // Act
      persistenceLayer.processExistingRecord(existingRecord, payload);
      expect(createHash).toHaveBeenCalledTimes(0);
    });
  });

  describe('Method: getExpiresAfterSeconds', () => {
    it('returns the configured value', () => {
      // Prepare
      const persistenceLayer = new PersistenceLayerTestClass();

      // Act
      const result = persistenceLayer.getExpiresAfterSeconds();

      // Assess
      expect(result).toBe(3600);
    });
  });
});
