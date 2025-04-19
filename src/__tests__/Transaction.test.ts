import { SqliteSTM } from '../index';

describe('Transaction', () => {
  let stm: SqliteSTM;

  beforeEach(() => {
    stm = new SqliteSTM();
  });

  describe('readTVar', () => {
    it('should read a TVar correctly', () => {
      stm.newTVar('test', 42);
      
      const result = stm.atomically(tx => tx.readTVar<number>('test'));
      expect(result).toBe(42);
    });

    it('should return the same value when reading a TVar multiple times in the same transaction', () => {
      stm.newTVar('test', 42);
      
      const result = stm.atomically(tx => {
        const value1 = tx.readTVar<number>('test');
        const value2 = tx.readTVar<number>('test');
        return { value1, value2 };
      });
      
      expect(result.value1).toBe(42);
      expect(result.value2).toBe(42);
    });

    it('should return the updated value when reading after writing in the same transaction', () => {
      stm.newTVar('test', 42);
      
      const result = stm.atomically(tx => {
        const value1 = tx.readTVar<number>('test');
        tx.writeTVar('test', 100);
        const value2 = tx.readTVar<number>('test');
        return { value1, value2 };
      });
      
      expect(result.value1).toBe(42);
      expect(result.value2).toBe(100);
    });
  });

  describe('writeTVar', () => {
    it('should write to a TVar correctly', () => {
      stm.newTVar('test', 42);
      
      stm.atomically(tx => {
        tx.writeTVar('test', 100);
      });
      
      const result = stm.atomically(tx => tx.readTVar<number>('test'));
      expect(result).toBe(100);
    });

    it('should overwrite previous writes in the same transaction', () => {
      stm.newTVar('test', 42);
      
      stm.atomically(tx => {
        tx.writeTVar('test', 100);
        tx.writeTVar('test', 200);
      });
      
      const result = stm.atomically(tx => tx.readTVar<number>('test'));
      expect(result).toBe(200);
    });
  });

  describe('readTVarPath', () => {
    it('should read a path from a TVar correctly', () => {
      stm.newTVar('test', { name: 'Alice' });
      
      const result = stm.atomically(tx => tx.readTVarPath<string>('test', 'name'));
      expect(result).toBe('Alice');
    });

    it('should return the same value when reading a path multiple times in the same transaction', () => {
      stm.newTVar('test', { name: 'Alice' });
      
      const result = stm.atomically(tx => {
        const value1 = tx.readTVarPath<string>('test', 'name');
        const value2 = tx.readTVarPath<string>('test', 'name');
        return { value1, value2 };
      });
      
      expect(result.value1).toBe('Alice');
      expect(result.value2).toBe('Alice');
    });

    it('should return the updated value when reading after updating in the same transaction', () => {
      stm.newTVar('test', { name: 'Alice' });
      
      const result = stm.atomically(tx => {
        const value1 = tx.readTVarPath<string>('test', 'name');
        tx.updateTVarPath('test', 'name', 'Bob');
        const value2 = tx.readTVarPath<string>('test', 'name');
        return { value1, value2 };
      });
      
      expect(result.value1).toBe('Alice');
      expect(result.value2).toBe('Bob');
    });
  });

  describe('updateTVarPath', () => {
    it('should update a path in a TVar correctly', () => {
      stm.newTVar('test', { name: 'Alice' });
      
      stm.atomically(tx => {
        tx.updateTVarPath('test', 'name', 'Bob');
      });
      
      const result = stm.atomically(tx => tx.readTVarPath<string>('test', 'name'));
      expect(result).toBe('Bob');
    });

    it('should overwrite previous updates in the same transaction', () => {
      stm.newTVar('test', { name: 'Alice' });
      
      stm.atomically(tx => {
        tx.updateTVarPath('test', 'name', 'Bob');
        tx.updateTVarPath('test', 'name', 'Charlie');
      });
      
      const result = stm.atomically(tx => tx.readTVarPath<string>('test', 'name'));
      expect(result).toBe('Charlie');
    });
  });

  describe('execute', () => {
    it('should retry on version conflicts', () => {
      stm.newTVar('counter', 0);
      
      // First transaction reads counter
      let value1: number;
      let success = false;
      
      stm.atomically(tx => {
        value1 = tx.readTVar<number>('counter');
        return value1;
      });
      
      // Second transaction increments counter
      stm.atomically(tx => {
        const value = tx.readTVar<number>('counter');
        tx.writeTVar('counter', value + 1);
      });
      
      // Third transaction tries to increment counter with old value
      // This should fail validation and retry
      try {
        stm.atomically(tx => {
          tx.writeTVar('counter', value1! + 1);
        });
      } catch (err) {
        success = true;
      }
      
      expect(success).toBe(true);
    });

    it('should throw an error after max attempts', (done) => {
      stm.newTVar('counter', 0);
      
      // Create a transaction that will always conflict
      const promise = new Promise<void>((resolve) => {
        setTimeout(() => {
          try {
            stm.atomically(tx => {
              const value = tx.readTVar<number>('counter');
              // Add artificial delay to cause conflict
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
              tx.writeTVar('counter', value + 1);
            });
          } catch (err) {
            if (err instanceof Error) {
              expect(err.message).toBe('Transaction failed: maximum retry limit exceeded');
            } else {
              throw new Error('Expected an Error object');
            }
            resolve();
          }
        }, 0);
      });
      
      // Create a transaction that will keep updating the counter
      const intervalId = setInterval(() => {
        stm.atomically(tx => {
          const value = tx.readTVar<number>('counter');
          tx.writeTVar('counter', value + 1);
        });
      }, 10);
      
      promise.then(() => {
        clearInterval(intervalId);
        done();
      });
    }, 10000); // Increased timeout to 10 seconds
  });
}); 