import { SqliteSTM } from '../index';

describe('SqliteSTM', () => {
  let stm: SqliteSTM;

  beforeEach(() => {
    stm = new SqliteSTM();
  });

  describe('newTVar', () => {
    it('should create a new TVar with initial value', () => {
      stm.newTVar('counter', 0);
      
      const result = stm.atomically(tx => {
        return tx.readTVar<number>('counter');
      });
      
      expect(result).toBe(0);
    });

    it('should throw an error when reading a non-existent TVar', () => {
      expect(() => {
        stm.atomically(tx => {
          return tx.readTVar<number>('non-existent');
        });
      }).toThrow('TVar non-existent does not exist');
    });
  });

  describe('atomically', () => {
    it('should execute a transaction successfully', () => {
      stm.newTVar('counter', 0);
      
      const result = stm.atomically(tx => {
        const value = tx.readTVar<number>('counter');
        tx.writeTVar('counter', value + 1);
        return value + 1;
      });
      
      expect(result).toBe(1);
      
      // Verify the value was actually updated
      const finalValue = stm.atomically(tx => {
        return tx.readTVar<number>('counter');
      });
      
      expect(finalValue).toBe(1);
    });

    it('should rollback on error', () => {
      stm.newTVar('counter', 0);
      
      try {
        stm.atomically(tx => {
          const value = tx.readTVar<number>('counter');
          tx.writeTVar('counter', value + 1);
          throw new Error('Test error');
        });
      } catch (error) {
        // Expected error
      }
      
      // Verify the value was not updated
      const finalValue = stm.atomically(tx => {
        return tx.readTVar<number>('counter');
      });
      
      expect(finalValue).toBe(0);
    });
  });
}); 