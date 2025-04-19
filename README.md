# node-stm

A TypeScript implementation of Software Transactional Memory (STM) using SQLite as the backing store. This library provides atomic transactions with optimistic concurrency control for managing shared state in Node.js applications.

## Features

- Atomic transactions with optimistic concurrency control
- SQLite-backed persistent storage
- JSON path-based access to nested data
- Type-safe API with TypeScript support
- In-memory and file-based database options

## Installation

```bash
npm install node-stm
```

## Usage

```typescript
import { SqliteSTM } from "node-stm";

// Create a new STM instance
const stm = new SqliteSTM();

// Create a new TVar (transactional variable)
stm.newTVar("counter", 0);

// Execute an atomic transaction
const result = stm.atomically((tx) => {
  // Read a TVar
  const value = tx.readTVar<number>("counter");

  // Write to a TVar
  tx.writeTVar("counter", value + 1);

  return value + 1;
});

// Access nested data using JSON paths
stm.atomically((tx) => {
  const user = tx.readTVarPath<any>("user", "$.name");
  tx.updateTVarPath("user", "$.age", 25);
});
```

## API

### SqliteSTM

- `newTVar<T>(id: string, initialValue: T): void` - Create a new transactional variable
- `atomically<T>(fn: (tx: Transaction) => T): T` - Execute an atomic transaction

### Transaction

- `readTVar<T>(id: string): T` - Read a transactional variable
- `writeTVar<T>(id: string, value: T): void` - Write to a transactional variable
- `readTVarPath<T>(id: string, path: string): T` - Read a specific path within a JSON object
- `updateTVarPath<T>(id: string, path: string, value: T): void` - Update a specific path within a JSON object

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
