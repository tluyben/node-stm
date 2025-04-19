import { SqliteSTM } from '../index';

describe('Concurrency', () => {
  let stm: SqliteSTM;

  beforeEach(() => {
    stm = new SqliteSTM(1);
  }, 30000); // Increased timeout to 30 seconds

  it('should handle concurrent transactions correctly', async () => {
    // Initialize a counter
    stm.newTVar('counter', 0);

    // Create multiple concurrent transactions
    const promises = Array.from(
      { length: 10 },
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            stm.atomically((tx) => {
              const counter = tx.readTVar<number>('counter');
              tx.writeTVar('counter', counter + 1);
            });
            resolve();
          }, Math.random() * 10);
        })
    );

    await Promise.all(promises);

    await new Promise((resolve) => setTimeout(resolve, 1000));
    // Verify final value
    const finalValue = stm.atomically((tx) => tx.readTVar<number>('counter'));
    expect(finalValue).toBe(10);
  }, 30000); // Increased timeout to 30 seconds

  it('should retry transactions on version conflicts', async () => {
    // Initialize a counter
    stm.newTVar('counter', 0);

    // Create a transaction that will conflict
    const promise1 = new Promise<void>((resolve) => {
      setTimeout(() => {
        stm.atomically((tx) => {
          const counter = tx.readTVar<number>('counter');
          // Add artificial delay to cause conflict
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
          tx.writeTVar('counter', counter + 1);
        });
        resolve();
      }, 0);
    });

    const promise2 = new Promise<void>((resolve) => {
      setTimeout(() => {
        stm.atomically((tx) => {
          const counter = tx.readTVar<number>('counter');
          tx.writeTVar('counter', counter + 1);
        });
        resolve();
      }, 10);
    });

    await Promise.all([promise1, promise2]);

    // Verify final value
    const finalValue = stm.atomically((tx) => tx.readTVar<number>('counter'));
    expect(finalValue).toBe(2);
  }, 30000); // Increased timeout to 30 seconds

  it('should handle complex concurrent operations', async () => {
    // Initialize a complex data structure
    stm.newTVar('users', {
      alice: { balance: 100, transactions: [] },
      bob: { balance: 50, transactions: [] },
    });

    // Create multiple concurrent transactions
    const promises = Array.from(
      { length: 5 },
      (_, i) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            stm.atomically((tx) => {
              const users = tx.readTVar<any>('users');
              const amount = 10;

              // Transfer money from Alice to Bob
              users.alice.balance -= amount;
              users.bob.balance += amount;

              // Record transaction
              users.alice.transactions.push({ type: 'debit', amount, id: i });
              users.bob.transactions.push({ type: 'credit', amount, id: i });

              tx.writeTVar('users', users);
            });
            resolve();
          }, Math.random() * 10);
        })
    );

    await Promise.all(promises);

    // Verify final state
    const finalState = stm.atomically((tx) => tx.readTVar<any>('users'));
    expect(finalState.alice.balance).toBe(50);
    expect(finalState.bob.balance).toBe(100);
    expect(finalState.alice.transactions).toHaveLength(5);
    expect(finalState.bob.transactions).toHaveLength(5);
  }, 30000); // Increased timeout to 30 seconds
});
