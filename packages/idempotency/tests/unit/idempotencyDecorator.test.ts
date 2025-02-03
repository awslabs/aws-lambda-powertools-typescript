import type { LambdaInterface } from '@aws-lambda-powertools/commons/types';
import context from '@aws-lambda-powertools/testing-utils/context';
import type { Context } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { idempotent, IdempotencyConfig } from '../../src/index.js';
import { PersistenceLayerTestClass } from '../helpers/idempotencyUtils.js';
import { BasePersistenceLayer } from '../../src/persistence/BasePersistenceLayer.js';

describe('Given a class with a function to decorate', () => {
  it('maintains the scope of the decorated function', async () => {
    // Prepare
    class TestClass implements LambdaInterface {
      private readonly foo = 'foo';

      @idempotent({
        persistenceStore: new PersistenceLayerTestClass(),
      })
      public async handler(
        _event: unknown,
        _context: Context
      ): Promise<string> {
        return this.privateMethod();
      }

      public privateMethod(): string {
        return `private ${this.foo}`;
      }
    }

    const handlerClass = new TestClass();
    const handler = handlerClass.handler.bind(handlerClass);

    // Act
    const result = await handler({}, context);

    // Assess
    expect(result).toBe('private foo');
  });

  it('configure persistenceStore idempotency key with custom keyPrefix', async () => {
    // Prepare
    const configureSpy = vi.spyOn(BasePersistenceLayer.prototype, 'configure');
    const idempotencyConfig = new IdempotencyConfig({});

    class TestClass implements LambdaInterface {
      @idempotent({
        persistenceStore: new PersistenceLayerTestClass(),
        config: idempotencyConfig,
        keyPrefix: 'my-custom-prefix',
      })
      public async handler(
        _event: unknown,
        _context: Context
      ): Promise<boolean> {
        return true;
      }
    }

    const handlerClass = new TestClass();
    const handler = handlerClass.handler.bind(handlerClass);

    // Act
    const result = await handler({}, context);
    

    // Assert
    expect(result).toBeTruthy();

    expect(configureSpy).toHaveBeenCalled();
    const configureCallArgs = configureSpy.mock.calls[0][0]; // Extract first call's arguments
    expect(configureCallArgs.config).toBe(idempotencyConfig);
    expect(configureCallArgs.keyPrefix).toBe('my-custom-prefix');

    // Restore the spy
    configureSpy.mockRestore();
  });
});
