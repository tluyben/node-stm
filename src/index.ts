import Database from 'better-sqlite3';

export class SqliteSTM {
  private db: any;
  private statements: Record<string, any> = {};
  
  constructor() {
    // Create in-memory database
    this.db = new Database(':memory:');
    
    // Enable JSON support
    this.db.pragma('json_enabled = ON');
    
    // Create table for storing TVars
    this.db.exec(`
      CREATE TABLE tvars (
        id TEXT PRIMARY KEY,
        value JSON NOT NULL, 
        version INTEGER NOT NULL DEFAULT 0
      )
    `);
    
    // Prepare common statements
    this.statements = {
      createTVar: this.db.prepare('INSERT INTO tvars (id, value, version) VALUES (?, json(?), 0)'),
      readTVar: this.db.prepare('SELECT value, version FROM tvars WHERE id = ?'),
      updateTVar: this.db.prepare('UPDATE tvars SET value = json(?), version = version + 1 WHERE id = ? AND version = ?'),
      checkVersion: this.db.prepare('SELECT version FROM tvars WHERE id = ?'),
      readJsonPath: this.db.prepare('SELECT json_extract(value, ?) FROM tvars WHERE id = ?'),
      updateJsonPath: this.db.prepare('UPDATE tvars SET value = json_set(value, ?, json(?)), version = version + 1 WHERE id = ? AND version = ?')
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
    while (true) {
      const tx = new Transaction(this.db, this.statements);

      try {
        return tx.execute(() => fn(tx));
      } catch (err) {
        if (err instanceof Error && err.message === 'Transaction failed: validation failed') {
          continue; // Just retry immediately
        }
        throw err;
      }
    }
  }
}

class Transaction {
  private db: any;
  private statements: Record<string, any>;
  private readSet: Map<string, {value: any, version: number, paths?: Set<string>}> = new Map();
  private writeSet: Map<string, {value?: any, patches?: Map<string, any>}> = new Map();
  
  constructor(db: any, statements: Record<string, any>) {
    this.db = db;
    this.statements = statements;
  }
  
  execute<T>(fn: () => T): T {
    // Execute user function first to get the result and collect read/write sets
    const result = fn();
    
    try {
      // Begin SQLite transaction only when we're ready to validate and commit
      this.db.prepare('BEGIN IMMEDIATE TRANSACTION').run();
      
      // Validate all reads
      for (const [id, {version}] of this.readSet.entries()) {
        const row = this.statements.checkVersion.get(id);
        if (!row || row.version !== version) {
          this.db.prepare('ROLLBACK').run();
          throw new Error('Transaction failed: validation failed');
        }
      }
      
      // Apply all writes
      for (const [id, {value, patches}] of this.writeSet.entries()) {
        // Get current version - if we haven't read it yet, read it now
        let version: number;
        if (this.readSet.has(id)) {
          version = this.readSet.get(id)!.version;
        } else {
          const row = this.statements.checkVersion.get(id);
          if (!row) {
            this.db.prepare('ROLLBACK').run();
            throw new Error(`TVar ${id} does not exist`);
          }
          version = row.version;
        }

        if (value !== undefined) {
          // Full object update
          const result = this.statements.updateTVar.run(JSON.stringify(value), id, version);
          if (result.changes === 0) {
            this.db.prepare('ROLLBACK').run();
            throw new Error('Transaction failed: validation failed');
          }
        } else if (patches && patches.size > 0) {
          // Get current value if we haven't read it yet
          let currentValue: any;
          if (this.readSet.has(id)) {
            currentValue = this.readSet.get(id)!.value;
          } else {
            const row = this.statements.readTVar.get(id);
            if (!row) {
              this.db.prepare('ROLLBACK').run();
              throw new Error(`TVar ${id} does not exist`);
            }
            currentValue = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
          }

          // Apply patches to current value
          for (const [path, patchValue] of patches.entries()) {
            this.setPath(currentValue, path.replace(/^\$\.?/, ''), patchValue);
          }

          // Update with patched value
          const result = this.statements.updateTVar.run(JSON.stringify(currentValue), id, version);
          if (result.changes === 0) {
            this.db.prepare('ROLLBACK').run();
            throw new Error('Transaction failed: validation failed');
          }
        }
      }
      
      // Commit transaction
      this.db.prepare('COMMIT').run();
      return result;
    } catch (err) {
      try {
        this.db.prepare('ROLLBACK').run();
      } catch (rollbackErr) {
        // Ignore rollback errors
      }
      throw err;
    }
  }
  
  // Read a TVar
  readTVar<T>(id: string): T {
    // If we've written to this TVar in this transaction, return that value
    if (this.writeSet.has(id)) {
      const writeEntry = this.writeSet.get(id)!;
      if (writeEntry.value !== undefined) {
        // Also add to read set to track version
        if (!this.readSet.has(id)) {
          const row = this.statements.checkVersion.get(id);
          this.readSet.set(id, { value: writeEntry.value, version: row.version });
        }
        return writeEntry.value;
      }
    }
    
    // If we've read this TVar before in this transaction, return cached value
    if (this.readSet.has(id)) {
      return this.readSet.get(id)!.value;
    }
    
    // Otherwise, read from the database
    const row = this.statements.readTVar.get(id);
    
    if (!row) {
      throw new Error(`TVar ${id} does not exist`);
    }
    
    const value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    this.readSet.set(id, { value, version: row.version });
    
    return value;
  }
  
  // Write to a TVar
  writeTVar<T>(id: string, value: T): void {
    // Store in write set
    this.writeSet.set(id, { value });
  }
  
  // Read a specific path within a JSON object TVar
  readTVarPath<T>(id: string, path: string): T {
    // Format path for SQLite json_extract (ensure it starts with $)
    const sqlitePath = path.startsWith('$') ? path : `$.${path}`;
    
    // If we've read this TVar before, check if we've accessed this path
    if (this.readSet.has(id)) {
      const entry = this.readSet.get(id)!;
      
      // Ensure we track which paths we've read
      if (!entry.paths) {
        entry.paths = new Set<string>();
      }
      entry.paths.add(sqlitePath);
      
      // Extract value from the path
      return this.extractPath(entry.value, path);
    }
    
    // Read the full value and store it in the read set
    const value = this.readTVar(id);
    return this.extractPath(value, path);
  }
  
  // Update a specific path within a JSON object TVar
  updateTVarPath<T>(id: string, path: string, value: T): void {
    // Format path for SQLite json_set (ensure it starts with $)
    const sqlitePath = path.startsWith('$') ? path : `$.${path}`;
    
    // Ensure we have an entry for this TVar
    if (!this.writeSet.has(id)) {
      this.writeSet.set(id, { patches: new Map() });
    }
    
    const entry = this.writeSet.get(id)!;
    
    // If we've done a full write, just update the in-memory value
    if (entry.value !== undefined) {
      this.setPath(entry.value, path, value);
      return;
    }
    
    // Otherwise, store the patch
    if (!entry.patches) {
      entry.patches = new Map();
    }
    entry.patches.set(sqlitePath, value);
  }
  
  // Helper to extract a value at a path from an object
  private extractPath(obj: any, path: string): any {
    // Handle root path
    if (path === '$' || path === '') {
      return obj;
    }
    
    // Remove leading $ if present
    const normalizedPath = path.startsWith('$') ? path.substring(1) : path;
    
    // Split path into segments
    const segments = normalizedPath.split('.');
    
    // Navigate through object
    let current = obj;
    for (const segment of segments) {
      if (current === undefined || current === null) {
        return undefined;
      }
      
      current = current[segment];
    }
    
    return current;
  }
  
  // Helper to set a value at a path in an object
  private setPath(obj: any, path: string, value: any): void {
    // Handle root path (replace entire object)
    if (path === '$' || path === '') {
      Object.keys(obj).forEach(key => delete obj[key]);
      Object.assign(obj, value);
      return;
    }
    
    // Remove leading $ if present
    const normalizedPath = path.startsWith('$') ? path.substring(1) : path;
    
    // Split path into segments
    const segments = normalizedPath.split('.');
    
    // Navigate to the parent of the target property
    let current = obj;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      
      if (!current[segment]) {
        current[segment] = {};
      }
      current = current[segment];
    }
    
    // Set the value on the final property
    const lastSegment = segments[segments.length - 1];
    current[lastSegment] = value;
  }
}