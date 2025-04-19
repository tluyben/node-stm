import { SqliteSTM } from '../index';

describe('Path Operations', () => {
  let stm: SqliteSTM;

  beforeEach(() => {
    stm = new SqliteSTM();
  });

  describe('readTVarPath', () => {
    it('should read a simple path from a TVar', () => {
      stm.newTVar('user', { name: 'Alice', age: 30 });

      const result = stm.atomically((tx) => {
        return tx.readTVarPath<string>('user', 'name');
      });

      expect(result).toBe('Alice');
    });

    it('should read a nested path from a TVar', () => {
      stm.newTVar('user', {
        profile: {
          address: {
            city: 'New York',
          },
        },
      });

      const result = stm.atomically((tx) => {
        return tx.readTVarPath<string>('user', 'profile.address.city');
      });

      expect(result).toBe('New York');
    });

    it('should read an array element from a TVar', () => {
      stm.newTVar('users', ['Alice', 'Bob', 'Charlie']);

      const result = stm.atomically((tx) => {
        return tx.readTVarPath<string>('users', '[1]');
      });

      expect(result).toBe('Bob');
    });

    it('should throw an error when reading a non-existent path', () => {
      stm.newTVar('user', { name: 'Alice' });

      expect(() => {
        stm.atomically((tx) => {
          return tx.readTVarPath<string>('user', 'age');
        });
      }).toThrow();
    });
  });

  describe('updateTVarPath', () => {
    it('should update a simple path in a TVar', () => {
      stm.newTVar('user', { name: 'Alice', age: 30 });

      stm.atomically((tx) => {
        tx.updateTVarPath('user', 'age', 31);
      });

      const result = stm.atomically((tx) => {
        return tx.readTVarPath<number>('user', 'age');
      });

      expect(result).toBe(31);
    });

    it('should update a nested path in a TVar', () => {
      stm.newTVar('user', {
        profile: {
          address: {
            city: 'New York',
          },
        },
      });

      stm.atomically((tx) => {
        tx.updateTVarPath('user', 'profile.address.city', 'Boston');
      });

      const result = stm.atomically((tx) => {
        return tx.readTVarPath<string>('user', 'profile.address.city');
      });

      expect(result).toBe('Boston');
    });

    it('should update an array element in a TVar', () => {
      stm.newTVar('users', ['Alice', 'Bob', 'Charlie']);

      stm.atomically((tx) => {
        tx.updateTVarPath('users', '[1]', 'Barbara');
      });

      const result = stm.atomically((tx) => {
        return tx.readTVarPath<string>('users', '[1]');
      });

      expect(result).toBe('Barbara');
    });

    it('should create a new path if it does not exist', () => {
      stm.newTVar('user', { name: 'Alice' });

      stm.atomically((tx) => {
        tx.updateTVarPath('user', 'age', 30);
      });

      const result = stm.atomically((tx) => {
        return tx.readTVar<{ name: string; age: number }>('user');
      });

      expect(result).toEqual({ name: 'Alice', age: 30 });
    });
  });
});
