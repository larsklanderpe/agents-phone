import { DatabaseSync } from 'node:sqlite';

// Each synchronous transaction reloads state so the owner CLI and worker cannot
// overwrite each other's changes. This small, single-instance service needs no ORM.
export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
    this.db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify({
      submissions: {}, preferences: {}, threads: {}, jobs: {}, seen: {}, audit: [],
    }));
  }
  read() { return JSON.parse(this.db.prepare('SELECT value FROM state WHERE id=1').get().value); }
  change(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = this.read();
      const result = fn(state);
      this.db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(state));
      this.db.exec('COMMIT');
      return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
