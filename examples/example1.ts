import { SqliteSTM } from '../dist/index';

const stm = new SqliteSTM();

// Create a TVar with a complex object
stm.newTVar('users', {
  alice: { balance: 100, transactions: [] },
  bob: { balance: 50, transactions: [] }
});

// Transaction using path-based operations
stm.atomically(tx => {
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
  tx.updateTVarPath('users', 'alice.transactions', [...aliceTxs, `Sent $${amount} to Bob (${txId})`]);
  tx.updateTVarPath('users', 'bob.transactions', [...bobTxs, `Received $${amount} from Alice (${txId})`]);
  
  return { from: 'alice', to: 'bob', amount };
});