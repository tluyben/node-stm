import { SqliteSTM } from '../index';

describe('Example Scenario', () => {
  let stm: SqliteSTM;

  beforeEach(() => {
    stm = new SqliteSTM();
  });

  it('should handle the money transfer example correctly', () => {
    // Create a TVar with a complex object
    stm.newTVar('users', {
      alice: { balance: 100, transactions: [] },
      bob: { balance: 50, transactions: [] },
    });

    // Execute the transaction
    const result = stm.atomically((tx) => {
      // Read specific paths
      const aliceBalance = tx.readTVarPath<number>('users', 'alice.balance');
      const bobBalance = tx.readTVarPath<number>('users', 'bob.balance');

      // Transfer amount
      const amount = 30;

      // Update specific paths
      tx.updateTVarPath('users', 'alice.balance', aliceBalance - amount);
      tx.updateTVarPath('users', 'bob.balance', bobBalance + amount);

      // Read arrays to update them
      const aliceTxs = tx.readTVarPath<string[]>('users', 'alice.transactions');
      const bobTxs = tx.readTVarPath<string[]>('users', 'bob.transactions');

      // Add new transactions
      const txId = Date.now().toString();
      tx.updateTVarPath('users', 'alice.transactions', [
        ...aliceTxs,
        `Sent $${amount} to Bob (${txId})`,
      ]);
      tx.updateTVarPath('users', 'bob.transactions', [
        ...bobTxs,
        `Received $${amount} from Alice (${txId})`,
      ]);

      return { from: 'alice', to: 'bob', amount };
    });

    // Verify the transaction result
    expect(result).toEqual({
      from: 'alice',
      to: 'bob',
      amount: 30,
    });

    // Verify the final state
    const finalState = stm.atomically((tx) => {
      return tx.readTVar<{
        alice: { balance: number; transactions: string[] };
        bob: { balance: number; transactions: string[] };
      }>('users');
    });

    // Check balances
    expect(finalState.alice.balance).toBe(70); // 100 - 30
    expect(finalState.bob.balance).toBe(80); // 50 + 30

    // Check transaction records
    expect(finalState.alice.transactions.length).toBe(1);
    expect(finalState.bob.transactions.length).toBe(1);
    expect(finalState.alice.transactions[0]).toContain('Sent $30 to Bob');
    expect(finalState.bob.transactions[0]).toContain('Received $30 from Alice');
  });

  it('should handle multiple transfers correctly', () => {
    // Create a TVar with a complex object
    stm.newTVar('users', {
      alice: { balance: 100, transactions: [] },
      bob: { balance: 50, transactions: [] },
    });

    // Execute multiple transfers
    for (let i = 0; i < 3; i++) {
      stm.atomically((tx) => {
        // Read specific paths
        const aliceBalance = tx.readTVarPath<number>('users', 'alice.balance');
        const bobBalance = tx.readTVarPath<number>('users', 'bob.balance');

        // Transfer amount
        const amount = 10;

        // Update specific paths
        tx.updateTVarPath('users', 'alice.balance', aliceBalance - amount);
        tx.updateTVarPath('users', 'bob.balance', bobBalance + amount);

        // Read arrays to update them
        const aliceTxs = tx.readTVarPath<string[]>('users', 'alice.transactions');
        const bobTxs = tx.readTVarPath<string[]>('users', 'bob.transactions');

        // Add new transactions
        const txId = Date.now().toString();
        tx.updateTVarPath('users', 'alice.transactions', [
          ...aliceTxs,
          `Sent $${amount} to Bob (${txId})`,
        ]);
        tx.updateTVarPath('users', 'bob.transactions', [
          ...bobTxs,
          `Received $${amount} from Alice (${txId})`,
        ]);
      });
    }

    // Verify the final state
    const finalState = stm.atomically((tx) => {
      return tx.readTVar<{
        alice: { balance: number; transactions: string[] };
        bob: { balance: number; transactions: string[] };
      }>('users');
    });

    // Check balances
    expect(finalState.alice.balance).toBe(70); // 100 - (3 * 10)
    expect(finalState.bob.balance).toBe(80); // 50 + (3 * 10)

    // Check transaction records
    expect(finalState.alice.transactions.length).toBe(3);
    expect(finalState.bob.transactions.length).toBe(3);
  });
});
