import { SqliteSTM } from '../index';

describe('Transaction', () => {
  let stm: SqliteSTM;

  beforeEach(() => {
    stm = new SqliteSTM();
  });

  describe('readTVar', () => {
    it('should read a TVar correctly', () => {
      stm.newTVar('test', 42);

      const result = stm.atomically((tx) => tx.readTVar<number>('test'));
      expect(result).toBe(42);
    });

    it('should return the same value when reading a TVar multiple times in the same transaction', () => {
      stm.newTVar('test', 42);

      const result = stm.atomically((tx) => {
        const value1 = tx.readTVar<number>('test');
        const value2 = tx.readTVar<number>('test');
        return { value1, value2 };
      });

      expect(result.value1).toBe(42);
      expect(result.value2).toBe(42);
    });

    it('should return the updated value when reading after writing in the same transaction', () => {
      stm.newTVar('test', 42);

      const result = stm.atomically((tx) => {
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

      stm.atomically((tx) => {
        tx.writeTVar('test', 100);
      });

      const result = stm.atomically((tx) => tx.readTVar<number>('test'));
      expect(result).toBe(100);
    });

    it('should overwrite previous writes in the same transaction', () => {
      stm.newTVar('test', 42);

      stm.atomically((tx) => {
        tx.writeTVar('test', 100);
        tx.writeTVar('test', 200);
      });

      const result = stm.atomically((tx) => tx.readTVar<number>('test'));
      expect(result).toBe(200);
    });
  });

  describe('readTVarPath', () => {
    it('should read a path from a TVar correctly', () => {
      stm.newTVar('test', { name: 'Alice' });

      const result = stm.atomically((tx) => tx.readTVarPath<string>('test', 'name'));
      expect(result).toBe('Alice');
    });

    it('should return the same value when reading a path multiple times in the same transaction', () => {
      stm.newTVar('test', { name: 'Alice' });

      const result = stm.atomically((tx) => {
        const value1 = tx.readTVarPath<string>('test', 'name');
        const value2 = tx.readTVarPath<string>('test', 'name');
        return { value1, value2 };
      });

      expect(result.value1).toBe('Alice');
      expect(result.value2).toBe('Alice');
    });

    it('should return the updated value when reading after updating in the same transaction', () => {
      stm.newTVar('test', { name: 'Alice' });

      const result = stm.atomically((tx) => {
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

      stm.atomically((tx) => {
        tx.updateTVarPath('test', 'name', 'Bob');
      });

      const result = stm.atomically((tx) => tx.readTVarPath<string>('test', 'name'));
      expect(result).toBe('Bob');
    });

    it('should overwrite previous updates in the same transaction', () => {
      stm.newTVar('test', { name: 'Alice' });

      stm.atomically((tx) => {
        tx.updateTVarPath('test', 'name', 'Bob');
        tx.updateTVarPath('test', 'name', 'Charlie');
      });

      const result = stm.atomically((tx) => tx.readTVarPath<string>('test', 'name'));
      expect(result).toBe('Charlie');
    });
  });

  describe('execute', () => {
    it('should detect version conflicts and retry', async () => {
      // Create two separate STM instances
      const stm1 = new SqliteSTM();
      const stm2 = stm1.newConnection();

      // Initialize the TVar in both connections
      stm1.newTVar('counter', 0);
      //   stm2.newTVar('counter', 0);

      let attempts = 0;

      try {
        stm2.atomically((tx2) => {
          // pause for 2 seconds
          setTimeout(() => {
            attempts++;
            const v = tx2.readTVar<number>('counter');
            tx2.writeTVar('counter', v + 1);
          }, 2000);
        });
      } catch (e) {
        // this should fail
        console.log(e);
      }

      // Create a transaction that will conflict with the other connection
      stm1.atomically((tx) => {
        attempts++;
        const value = tx.readTVar<number>('counter');

        // This write will fail on first attempt due to version mismatch
        tx.writeTVar('counter', value + 1);
      });

      // we need to pause here for 2.5 seconds;
      await new Promise((resolve) => setTimeout(resolve, 2500));
      console.log('waiting for 2.5 seconds');
      expect(attempts).toBe(2);

      // Verify final value is correct (both increments succeeded)
      const finalValue = stm1.atomically((tx) => tx.readTVar<number>('counter'));
      expect(finalValue).toBe(2);
    });
  });
});
