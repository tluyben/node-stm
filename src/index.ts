import Database from 'better-sqlite3';

const SHARED_DB_URI = 'file:memdb1?mode=memory&cache=shared';

export class SqliteSTM {
  private db: any;
  private statements: Record<string, any> = {};

  constructor(db: number, empty: boolean = false) {
    // Create in-memory database
    this.db = new Database(`file:memdb${db}?mode=memory&cache=shared`);

    // Enable JSON support
    // this.db.pragma('journal_mode = WAL');
    this.db.pragma('json_enabled = ON');

    // Create table for storing TVars
    if (empty) {
      // delete the tvars table
      this.db.exec('DROP TABLE IF EXISTS tvars');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tvars (
        id TEXT PRIMARY KEY,
        value JSON NOT NULL, 
        version INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Prepare common statements
    this.statements = {
      createTVar: this.db.prepare('INSERT INTO tvars (id, value, version) VALUES (?, json(?), 0)'),
      readTVar: this.db.prepare('SELECT value, version FROM tvars WHERE id = ?'),
      updateTVar: this.db.prepare(
        'UPDATE tvars SET value = json(?), version = version + 1 WHERE id = ? AND version = ?'
      ),
      readJsonPath: this.db.prepare('SELECT json_extract(value, ?) FROM tvars WHERE id = ?'),
      updateJsonPath: this.db.prepare(
        'UPDATE tvars SET value = json_set(value, ?, json(?)), version = version + 1 WHERE id = ? AND version = ?'
      ),
      readArrayLength: this.db.prepare(
        'SELECT json_array_length(json_extract(value, ?)) FROM tvars WHERE id = ?'
      ),
    };
  }

  // Create a new TVar
  newTVar<T>(id: string, initialValue: T): void {
    try {
      // Check if TVar already exists
      const existing = this.db.prepare('SELECT id FROM tvars WHERE id = ?').get(id);
      if (existing) {
        throw new Error(`TVar ${id} already exists`);
      }

      // Create new TVar
      this.statements.createTVar.run(id, JSON.stringify(initialValue));
    } catch (err) {
      console.error('Error creating TVar:', err);
      throw err;
    }
  }

  // Execute an atomic transaction
  atomically<T>(fn: (tx: Transaction) => T): T {
    let attempts = 0;
    const maxAttempts = 1000;

    while (true) {
      const tx = new Transaction(this.db, this.statements);

      try {
        return tx.execute(() => fn(tx));
      } catch (err) {
        if (err instanceof Error && err.message === 'Concurrent modification detected') {
          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error('Transaction failed: max retry attempts exceeded');
          }
          // Add a small delay before retrying to reduce contention
          if (attempts % 10 === 0) {
            const delay = Math.min(100, Math.pow(2, attempts / 10));
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
          }
          continue; // Retry transaction
        }
        throw err;
      }
    }
  }
}

class Transaction {
  private db: any;
  private statements: Record<string, any>;

  constructor(db: any, statements: Record<string, any>) {
    this.db = db;
    this.statements = statements;
  }

  execute<T>(fn: () => T): T {
    // Begin SQLite transaction with IMMEDIATE to get write lock
    this.db.prepare('BEGIN IMMEDIATE TRANSACTION').run();

    try {
      // Execute user function
      const result = fn();

      // Commit transaction
      this.db.prepare('COMMIT').run();
      return result;
    } catch (err) {
      // Rollback transaction on error
      this.db.prepare('ROLLBACK').run();
      throw err;
    }
  }

  // Read a TVar
  readTVar<T>(id: string): T {
    const row = this.statements.readTVar.get(id);

    if (!row) {
      throw new Error(`TVar ${id} does not exist`);
    }

    return typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  }

  // Write to a TVar
  writeTVar<T>(id: string, value: T): void {
    // Get current version
    const row = this.statements.readTVar.get(id);
    if (!row) {
      throw new Error(`TVar ${id} does not exist`);
    }

    // Update with optimistic concurrency control
    const result = this.statements.updateTVar.run(JSON.stringify(value), id, row.version);
    if (result.changes === 0) {
      throw new Error('Concurrent modification detected');
    }
  }

  // Read a specific path within a JSON object TVar
  readTVarPath<T>(id: string, path: string): T {
    // Format path for SQLite json_extract (ensure it starts with $)
    const sqlitePath = this.formatSqlitePath(path);

    const row = this.statements.readJsonPath.get(sqlitePath, id);
    if (!row) {
      throw new Error(`TVar ${id} does not exist`);
    }

    let value = row['json_extract(value, ?)'];
    if (value && typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
      value = JSON.parse(value);
    }

    if (value === null) {
      throw new Error(`Path ${path} does not exist in TVar ${id}`);
    }

    return value;
  }

  // Update a specific path within a JSON object TVar
  updateTVarPath<T>(id: string, path: string, value: T): void {
    // Format path for SQLite json_set (ensure it starts with $)
    const sqlitePath = this.formatSqlitePath(path);

    // Get current version
    const row = this.statements.readTVar.get(id);
    if (!row) {
      throw new Error(`TVar ${id} does not exist`);
    }

    // Update with optimistic concurrency control
    const result = this.statements.updateJsonPath.run(
      sqlitePath,
      JSON.stringify(value),
      id,
      row.version
    );
    if (result.changes === 0) {
      throw new Error('Concurrent modification detected');
    }
  }

  // Helper to format path for SQLite JSON functions
  private formatSqlitePath(path: string): string {
    if (path === '$' || path === '') {
      return '$';
    }

    // Handle array indices
    if (path.startsWith('[') && path.endsWith(']')) {
      // Direct array index like [1]
      return '$' + path;
    }

    // Start with root
    let sqlitePath = path.startsWith('$') ? path : `$.${path}`;

    // Convert .number to [number] for array indices
    sqlitePath = sqlitePath.replace(/\.(\d+)(?=\.|$)/g, '[$1]');

    // Ensure array indices are properly formatted
    sqlitePath = sqlitePath.replace(/\[(\d+)\]/g, '[$1]');

    return sqlitePath;
  }
}
