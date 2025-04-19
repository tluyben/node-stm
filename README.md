# 🚀 node-stm

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)

</div>

A powerful TypeScript implementation of Software Transactional Memory (STM) using SQLite as the backing store. This library provides atomic transactions with optimistic concurrency control for managing shared state in Node.js applications.

## 📚 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Core Concepts](#-core-concepts)
- [API Reference](#-api-reference)
- [Examples](#-examples)
- [Advanced Usage](#-advanced-usage)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

- 🔄 **Atomic Transactions**: Guaranteed atomicity for all operations
- 🛡️ **Optimistic Concurrency Control**: Automatic conflict detection and resolution
- 💾 **SQLite Backing Store**: Persistent and reliable storage
- 🗺️ **JSON Path Operations**: Access nested data with path-based operations
- 📝 **Type Safety**: Full TypeScript support with type inference
- 🔌 **Multiple Database Modes**: Support for both in-memory and file-based storage
- 🔄 **Automatic Retries**: Built-in retry mechanism for handling conflicts
- 🚀 **High Performance**: Optimized for concurrent operations

## 📦 Installation

```bash
npm install node-stm
```

## 🚀 Quick Start

```typescript
import { SqliteSTM } from 'node-stm';

// Create a new STM instance
const stm = new SqliteSTM();

// Create a new TVar (transactional variable)
stm.newTVar('counter', 0);

// Execute an atomic transaction
const result = stm.atomically((tx) => {
  const value = tx.readTVar<number>('counter');
  tx.writeTVar('counter', value + 1);
  return value + 1;
});

console.log(result); // Output: 1
```

## 🧠 Core Concepts

### TVars (Transactional Variables)

TVars are the fundamental building blocks of the STM system. They are:

- 🔒 Thread-safe and transactionally consistent
- 📦 Can store any JSON-serializable value
- 🔄 Automatically versioned for conflict detection

### Transactions

Transactions provide atomic operations with these guarantees:

- ⚡ All-or-nothing execution
- 🔄 Automatic rollback on failure
- 🛡️ Conflict detection and resolution
- 🔁 Automatic retries on conflicts

### Path Operations

Access nested data using JSON paths:

```typescript
// Read nested data
const city = tx.readTVarPath<string>('user', 'address.city');

// Update nested data
tx.updateTVarPath('user', 'preferences.theme', 'dark');
```

## 📖 API Reference

### SqliteSTM Class

#### Constructor

```typescript
constructor(db?: number, dir?: string)
```

- `db`: Optional database ID (auto-generated if not provided)
- `dir`: Optional directory for database storage

#### Methods

##### newTVar<T>

```typescript
newTVar<T>(id: string, initialValue: T): void
```

Creates a new transactional variable.

##### atomically<T>

```typescript
atomically<T>(fn: (tx: Transaction) => T): T
```

Executes an atomic transaction.

##### newConnection

```typescript
newConnection(): SqliteSTM
```

Creates a new connection to the same database.

### Transaction Class

#### Methods

##### readTVar<T>

```typescript
readTVar<T>(id: string): T
```

Reads a transactional variable.

##### writeTVar<T>

```typescript
writeTVar<T>(id: string, value: T): void
```

Writes to a transactional variable.

##### readTVarPath<T>

```typescript
readTVarPath<T>(id: string, path: string): T
```

Reads a specific path within a JSON object.

##### updateTVarPath<T>

```typescript
updateTVarPath<T>(id: string, path: string, value: T): void
```

Updates a specific path within a JSON object.

## 📝 Examples

### Money Transfer Example

```typescript
// Create a TVar with user balances
stm.newTVar('users', {
  alice: { balance: 100, transactions: [] },
  bob: { balance: 50, transactions: [] },
});

// Execute a money transfer
stm.atomically((tx) => {
  const aliceBalance = tx.readTVarPath<number>('users', 'alice.balance');
  const bobBalance = tx.readTVarPath<number>('users', 'bob.balance');

  // Transfer $30 from Alice to Bob
  tx.updateTVarPath('users', 'alice.balance', aliceBalance - 30);
  tx.updateTVarPath('users', 'bob.balance', bobBalance + 30);

  // Record the transaction
  const txId = Date.now().toString();
  tx.updateTVarPath('users', 'alice.transactions', [
    ...tx.readTVarPath<string[]>('users', 'alice.transactions'),
    `Sent $30 to Bob (${txId})`,
  ]);
});
```

### Concurrent Counter Example

```typescript
// Initialize counter
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
```

## 🔧 Advanced Usage

### Custom Database Directory

```typescript
const stm = new SqliteSTM(undefined, '/path/to/db/directory');
```

### Handling Concurrent Modifications

```typescript
try {
  stm.atomically((tx) => {
    // Your transaction code
  });
} catch (error) {
  if (error.message === 'Concurrent modification detected') {
    // Handle conflict
  }
}
```

### Nested Transactions

```typescript
stm.atomically((tx) => {
  // Outer transaction
  stm.newConnection().atomically((innerTx) => {
    // Inner transaction
  });
});
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by Haskell's STM implementation
- Built with [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- Thanks to all contributors who have helped shape this project
