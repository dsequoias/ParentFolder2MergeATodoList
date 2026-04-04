import * as SQLite from 'expo-sqlite';

import { TODOS_SEED } from './seedData';

const dbName = 'TodoDB.db';
let db = null;
// Singleton guard: if initDatabase() is called concurrently, all callers await the same promise.
let initPromise = null;

export const initDatabase = async () => {
  if (initPromise) return initPromise;
  initPromise = _initDatabase().catch((err) => {
    // Reset so a future call can retry after a transient failure.
    initPromise = null;
    throw err;
  });
  return initPromise;
};

const _initDatabase = async () => {
  try {
    db = await SQLite.openDatabaseAsync(dbName);
    await db.execAsync('PRAGMA busy_timeout = 5000;');
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS TodosTB (
        TaskID INTEGER PRIMARY KEY AUTOINCREMENT,
        Task TEXT NOT NULL CHECK(length(Task) <= 40),
        Date DATE,
        Time TIME,
        Completed INTEGER DEFAULT 0 CHECK(Completed IN (0, 1)),
        Notes TEXT CHECK(length(Notes) <= 70),
        CompletDateTime DATETIME
      );
    `);
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_todostb_date ON TodosTB(Date);`);
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_todostb_completed ON TodosTB(Completed);`);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS AuditTB (
        AuditID INTEGER PRIMARY KEY AUTOINCREMENT,
        TaskID INTEGER NOT NULL,
        Task TEXT,
        Action TEXT NOT NULL CHECK(Action IN ('create', 'update', 'delete')),
        DateTime DATETIME NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
    `);
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_audittb_taskid ON AuditTB(TaskID);`);
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_audittb_datetime ON AuditTB(DateTime);`);
    try {
      await db.execAsync(`
        CREATE TRIGGER tr_TodosTB_after_insert
        AFTER INSERT ON TodosTB FOR EACH ROW
        BEGIN
          INSERT INTO AuditTB (TaskID, Task, Action, DateTime)
          VALUES (NEW.TaskID, NEW.Task, 'create', datetime('now', 'localtime'));
        END;
      `);
    } catch (_) {}
    try {
      await db.execAsync(`
        CREATE TRIGGER tr_TodosTB_after_update
        AFTER UPDATE ON TodosTB FOR EACH ROW
        BEGIN
          INSERT INTO AuditTB (TaskID, Task, Action, DateTime)
          VALUES (NEW.TaskID, NEW.Task, 'update', datetime('now', 'localtime'));
        END;
      `);
    } catch (_) {}
    try {
      await db.execAsync(`
        CREATE TRIGGER tr_TodosTB_after_delete
        AFTER DELETE ON TodosTB FOR EACH ROW
        BEGIN
          INSERT INTO AuditTB (TaskID, Task, Action, DateTime)
          VALUES (OLD.TaskID, OLD.Task, 'delete', datetime('now', 'localtime'));
        END;
      `);
    } catch (_) {}

    // Column migrations: swallow "duplicate column" errors only; log anything unexpected in dev.
    const migrations = [
      'ALTER TABLE TodosTB ADD COLUMN ReminderMinutes INTEGER DEFAULT 0',
      'ALTER TABLE TodosTB ADD COLUMN Reminder2Minutes INTEGER DEFAULT 0',
      'ALTER TABLE TodosTB ADD COLUMN Reminder3Minutes INTEGER DEFAULT 0',
      'ALTER TABLE TodosTB ADD COLUMN RemindersJSON TEXT',
    ];
    for (const sql of migrations) {
      try {
        await db.execAsync(sql);
      } catch (e) {
        if (__DEV__ && !e?.message?.includes('duplicate column')) {
          console.warn('Migration warning:', e.message);
        }
      }
    }

    const countResult = await db.getFirstAsync('SELECT COUNT(*) as count FROM TodosTB');
    const count = countResult?.count ?? 0;
    if (count === 0 && TODOS_SEED.length > 0) {
      // Wrap seed inserts in a single transaction to avoid repeated lock acquire/release.
      await db.withTransactionAsync(async () => {
        for (const row of TODOS_SEED) {
          await db.runAsync(
            `INSERT INTO TodosTB (Task, "Date", "Time", Completed, Notes, CompletDateTime, ReminderMinutes, Reminder2Minutes, Reminder3Minutes, RemindersJSON) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              row.Task, row.Date, row.Time, row.Completed,
              row.Notes ?? null, row.CompletDateTime ?? null,
              row.ReminderMinutes ?? 0, row.Reminder2Minutes ?? 0,
              row.Reminder3Minutes ?? 0, row.RemindersJSON ?? null,
            ]
          );
        }
      });
      console.log(`Seeded ${TODOS_SEED.length} todos into TodosTB`);
    }
    console.log('TodoDB.db initialized successfully');
    return db;
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

export const getDatabase = () => {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
};

export const getAllTodos = async () => {
  const database = getDatabase();
  return database.getAllAsync('SELECT * FROM TodosTB ORDER BY Date DESC, Time DESC');
};

export const getTodoById = async (TaskID) => {
  const database = getDatabase();
  return database.getFirstAsync('SELECT * FROM TodosTB WHERE TaskID = ?', [TaskID]);
};

export const insertTodo = async (todo) => {
  const database = getDatabase();
  const result = await database.runAsync(
    `INSERT INTO TodosTB (Task, "Date", "Time", Completed, Notes, CompletDateTime, ReminderMinutes, Reminder2Minutes, Reminder3Minutes, RemindersJSON) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      todo.Task,
      todo.DueDate ?? todo.Date ?? null,
      todo.DueTime ?? todo.Time ?? null,
      todo.Completed ?? 0,
      todo.Notes ?? null,
      todo.CompletDateTime ?? null,
      todo.ReminderMinutes ?? 0,
      todo.Reminder2Minutes ?? 0,
      todo.Reminder3Minutes ?? 0,
      todo.RemindersJSON ?? null,
    ]
  );
  return result.lastInsertRowId;
};

export const updateTodo = async (TaskID, todo) => {
  const database = getDatabase();
  await database.runAsync(
    `UPDATE TodosTB SET Task = ?, "Date" = ?, "Time" = ?, Completed = ?, Notes = ?, CompletDateTime = ?, ReminderMinutes = ?, Reminder2Minutes = ?, Reminder3Minutes = ?, RemindersJSON = ? WHERE TaskID = ?`,
    [
      todo.Task,
      todo.DueDate ?? todo.Date ?? null,
      todo.DueTime ?? todo.Time ?? null,
      todo.Completed ?? 0,
      todo.Notes ?? null,
      todo.CompletDateTime ?? null,
      todo.ReminderMinutes ?? 0,
      todo.Reminder2Minutes ?? 0,
      todo.Reminder3Minutes ?? 0,
      todo.RemindersJSON ?? null,
      TaskID,
    ]
  );
  return true;
};

export const deleteTodo = async (TaskID) => {
  const database = getDatabase();
  await database.runAsync('DELETE FROM TodosTB WHERE TaskID = ?', [TaskID]);
  return true;
};

export const toggleTodoCompletion = async (TaskID, completed) => {
  const database = getDatabase();
  const CompletDateTime = completed
    ? new Date().toISOString().slice(0, 19).replace('T', ' ')
    : null;
  await database.runAsync(
    'UPDATE TodosTB SET Completed = ?, CompletDateTime = ? WHERE TaskID = ?',
    [completed ? 1 : 0, CompletDateTime, TaskID]
  );
  return true;
};

export const resetDatabase = async () => {
  const database = getDatabase();
  await database.execAsync('DELETE FROM TodosTB');
  await database.execAsync('DELETE FROM AuditTB');
  await database.execAsync("DELETE FROM sqlite_sequence WHERE name IN ('TodosTB','AuditTB')");
};