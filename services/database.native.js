import * as SQLite from 'expo-sqlite';
import { TODOS_SEED } from './seedData';

const dbName = 'TodoDB.db';
let db = null;

// Initialize TodoDB.db with TodosTB and AuditTB (same schema as your TodoDB.db)
export const initDatabase = async () => {
  try {
    db = await SQLite.openDatabaseAsync(dbName);

    // Create TodosTB and AuditTB to match TodoDB.db schema
    await db.execAsync(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS TodosTB (
        TaskID INTEGER PRIMARY KEY AUTOINCREMENT,
        Task TEXT NOT NULL CHECK(length(Task) <= 40),
        Date DATE,
        Time TIME,
        Completed INTEGER DEFAULT 0 CHECK(Completed IN (0, 1)),
        Notes TEXT CHECK(length(Notes) <= 70),
        CompletDateTime DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_todostb_date ON TodosTB(Date);
      CREATE INDEX IF NOT EXISTS idx_todostb_completed ON TodosTB(Completed);

      CREATE TABLE IF NOT EXISTS AuditTB (
        AuditID INTEGER PRIMARY KEY AUTOINCREMENT,
        TaskID INTEGER NOT NULL,
        Task TEXT,
        Action TEXT NOT NULL CHECK(Action IN ('create', 'update', 'delete')),
        DateTime DATETIME NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_audittb_taskid ON AuditTB(TaskID);
      CREATE INDEX IF NOT EXISTS idx_audittb_datetime ON AuditTB(DateTime);
    `);

    // Create triggers for audit (if not exist - SQLite doesn't have IF NOT EXISTS for triggers, so we ignore errors or use separate exec)
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

    try {
      await db.execAsync('ALTER TABLE TodosTB ADD COLUMN ReminderMinutes INTEGER DEFAULT 0');
    } catch (_) {}
    try {
      await db.execAsync('ALTER TABLE TodosTB ADD COLUMN Reminder2Minutes INTEGER DEFAULT 0');
    } catch (_) {}
    try {
      await db.execAsync('ALTER TABLE TodosTB ADD COLUMN Reminder3Minutes INTEGER DEFAULT 0');
    } catch (_) {}
    try {
      await db.execAsync('ALTER TABLE TodosTB ADD COLUMN RemindersJSON TEXT');
    } catch (_) {}

    // Seed TodosTB from TodoDB.db data when empty
    const countResult = await db.getFirstAsync('SELECT COUNT(*) as count FROM TodosTB');
    const count = countResult?.count ?? 0;
    if (count === 0 && TODOS_SEED.length > 0) {
      for (const row of TODOS_SEED) {
        await db.runAsync(
          `INSERT INTO TodosTB (Task, "Date", "Time", Completed, Notes, CompletDateTime, ReminderMinutes, Reminder2Minutes, Reminder3Minutes, RemindersJSON) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.Task,
            row.Date,
            row.Time,
            row.Completed,
            row.Notes ?? null,
            row.CompletDateTime ?? null,
            row.ReminderMinutes ?? 0,
            row.Reminder2Minutes ?? 0,
            row.Reminder3Minutes ?? 0,
            row.RemindersJSON ?? null,
          ]
        );
      }
      console.log(`Seeded ${TODOS_SEED.length} todos into TodosTB (TodoDB.db)`);
    }

    console.log('TodoDB.db initialized with TodosTB');
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
  const Task = todo.Task;
  const DueDate = todo.DueDate ?? todo.Date ?? null;
  const DueTime = todo.DueTime ?? todo.Time ?? null;
  const Completed = todo.Completed ?? 0;
  const Notes = todo.Notes ?? null;
  const CompletDateTime = todo.CompletDateTime ?? null;
  const ReminderMinutes = todo.ReminderMinutes ?? 0;
  const Reminder2Minutes = todo.Reminder2Minutes ?? 0;
  const Reminder3Minutes = todo.Reminder3Minutes ?? 0;
  const RemindersJSON = todo.RemindersJSON ?? null;
  const result = await database.runAsync(
    `INSERT INTO TodosTB (Task, "Date", "Time", Completed, Notes, CompletDateTime, ReminderMinutes, Reminder2Minutes, Reminder3Minutes, RemindersJSON) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [Task, DueDate, DueTime, Completed, Notes, CompletDateTime, ReminderMinutes, Reminder2Minutes, Reminder3Minutes, RemindersJSON]
  );
  return result.lastInsertRowId;
};

export const updateTodo = async (TaskID, todo) => {
  const database = getDatabase();
  const Task = todo.Task;
  const DueDate = todo.DueDate ?? todo.Date ?? null;
  const DueTime = todo.DueTime ?? todo.Time ?? null;
  const Completed = todo.Completed ?? 0;
  const Notes = todo.Notes ?? null;
  const CompletDateTime = todo.CompletDateTime ?? null;
  const ReminderMinutes = todo.ReminderMinutes ?? 0;
  const Reminder2Minutes = todo.Reminder2Minutes ?? 0;
  const Reminder3Minutes = todo.Reminder3Minutes ?? 0;
  const RemindersJSON = todo.RemindersJSON ?? null;
  await database.runAsync(
    `UPDATE TodosTB SET Task = ?, "Date" = ?, "Time" = ?, Completed = ?, Notes = ?, CompletDateTime = ?, ReminderMinutes = ?, Reminder2Minutes = ?, Reminder3Minutes = ?, RemindersJSON = ? WHERE TaskID = ?`,
    [Task, DueDate, DueTime, Completed, Notes, CompletDateTime, ReminderMinutes, Reminder2Minutes, Reminder3Minutes, RemindersJSON, TaskID]
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
  const CompletDateTime = completed ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
  await database.runAsync(
    'UPDATE TodosTB SET Completed = ?, CompletDateTime = ? WHERE TaskID = ?',
    [completed ? 1 : 0, CompletDateTime, TaskID]
  );
  return true;
};

/** Clear all data: empty TodosTB and AuditTB, reset IDs. */
export const resetDatabase = async () => {
  const database = getDatabase();
  await database.execAsync('DELETE FROM TodosTB');
  await database.execAsync('DELETE FROM AuditTB');
  await database.execAsync("DELETE FROM sqlite_sequence WHERE name IN ('TodosTB','AuditTB')");
};
