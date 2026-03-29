/**
 * Web: uses local API server when running (updates real TodoDB.db);
 * otherwise falls back to localStorage.
 */
import { TODOS_SEED } from './seedData';

const API_BASE = 'http://localhost:3001';
const STORAGE_KEY = 'TodoApp_TodosTB';
let nextTaskID = 1;
/** null = not checked, true = use API, false = use localStorage */
let useApi = null;

const ping = async () => {
  try {
    const r = await fetch(`${API_BASE}/ping`, { method: 'GET' });
    return r.ok;
  } catch {
    return false;
  }
};

const ensureMode = async () => {
  if (useApi === null) useApi = await ping();
  return useApi;
};

const loadTodos = () => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const list = raw ? JSON.parse(raw) : [];
    if (list.length > 0) {
      const maxId = Math.max(...list.map((t) => t.TaskID || 0));
      nextTaskID = maxId + 1;
    }
    return list;
  } catch {
    return [];
  }
};

const saveTodos = (list) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
};

const localStorageAll = () => {
  const list = loadTodos();
  return list.sort((a, b) => {
    const d = (b.Date || '').localeCompare(a.Date || '');
    if (d !== 0) return d;
    return (b.Time || '').localeCompare(a.Time || '');
  });
};

export const initDatabase = async () => {
  const apiOk = await ensureMode();
  if (apiOk) {
    console.log('TodoApp (web) using API server – changes save to TodoDB.db');
    return null;
  }
  const list = loadTodos();
  if (list.length === 0 && TODOS_SEED.length > 0) {
    const seeded = TODOS_SEED.map((row, i) => ({
      TaskID: i + 1,
      Task: row.Task,
      Date: row.Date,
      Time: row.Time,
      Completed: row.Completed,
      Notes: row.Notes,
      CompletDateTime: row.CompletDateTime,
    }));
    nextTaskID = seeded.length + 1;
    saveTodos(seeded);
    console.log(`Seeded ${TODOS_SEED.length} todos (localStorage – start API server to use TodoDB.db)`);
  }
  return null;
};

export const getDatabase = () => null;

/** Clear all data: localStorage and optionally server (when using API). */
export const resetDatabase = async () => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
  nextTaskID = 1;
  const apiOk = await ensureMode();
  if (apiOk) {
    try {
      await fetch(`${API_BASE}/reset`, { method: 'POST' });
    } catch (_) {}
  }
};

export const getAllTodos = async () => {
  if (await ensureMode()) {
    try {
      const r = await fetch(`${API_BASE}/todos`);
      if (!r.ok) throw new Error(r.statusText);
      const rows = await r.json();
      return rows;
    } catch (e) {
      useApi = false;
    }
  }
  return localStorageAll();
};

export const getTodoById = async (TaskID) => {
  if (await ensureMode()) {
    try {
      const r = await fetch(`${API_BASE}/todos/${TaskID}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(r.statusText);
      return await r.json();
    } catch (e) {
      useApi = false;
    }
  }
  const list = loadTodos();
  return list.find((t) => String(t.TaskID) === String(TaskID)) || null;
};

export const insertTodo = async (todo) => {
  if (await ensureMode()) {
    try {
      const r = await fetch(`${API_BASE}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Task: todo.Task,
          DueDate: todo.DueDate ?? todo.Date ?? null,
          DueTime: todo.DueTime ?? todo.Time ?? null,
          Completed: todo.Completed ?? 0,
          Notes: todo.Notes ?? null,
          CompletDateTime: todo.CompletDateTime ?? null,
          ReminderMinutes: todo.ReminderMinutes ?? 0,
          Reminder2Minutes: todo.Reminder2Minutes ?? 0,
          Reminder3Minutes: todo.Reminder3Minutes ?? 0,
          RemindersJSON: todo.RemindersJSON ?? null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || r.statusText);
      const { TaskID } = await r.json();
      return TaskID;
    } catch (e) {
      useApi = false;
    }
  }
  const list = loadTodos();
  const TaskID = nextTaskID++;
  const row = {
    TaskID,
    Task: todo.Task,
    Date: todo.DueDate ?? todo.Date ?? null,
    Time: todo.DueTime ?? todo.Time ?? null,
    Completed: todo.Completed || 0,
    Notes: todo.Notes || null,
    CompletDateTime: todo.CompletDateTime || null,
    ReminderMinutes: todo.ReminderMinutes ?? 0,
    Reminder2Minutes: todo.Reminder2Minutes ?? 0,
    Reminder3Minutes: todo.Reminder3Minutes ?? 0,
    RemindersJSON: todo.RemindersJSON ?? null,
  };
  list.push(row);
  saveTodos(list);
  return TaskID;
};

export const updateTodo = async (TaskID, todo) => {
  if (await ensureMode()) {
    try {
      const r = await fetch(`${API_BASE}/todos/${TaskID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Task: todo.Task,
          DueDate: todo.DueDate ?? todo.Date ?? null,
          DueTime: todo.DueTime ?? todo.Time ?? null,
          Completed: todo.Completed ?? 0,
          Notes: todo.Notes ?? null,
          CompletDateTime: todo.CompletDateTime ?? null,
          ReminderMinutes: todo.ReminderMinutes ?? 0,
          Reminder2Minutes: todo.Reminder2Minutes ?? 0,
          Reminder3Minutes: todo.Reminder3Minutes ?? 0,
          RemindersJSON: todo.RemindersJSON ?? null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || r.statusText);
      return true;
    } catch (e) {
      useApi = false;
    }
  }
  const list = loadTodos();
  const i = list.findIndex((t) => String(t.TaskID) === String(TaskID));
  if (i === -1) return false;
  list[i] = {
    ...list[i],
    Task: todo.Task,
    Date: todo.DueDate ?? todo.Date ?? null,
    Time: todo.DueTime ?? todo.Time ?? null,
    Completed: todo.Completed || 0,
    Notes: todo.Notes || null,
    CompletDateTime: todo.CompletDateTime || null,
    ReminderMinutes: todo.ReminderMinutes ?? 0,
    Reminder2Minutes: todo.Reminder2Minutes ?? 0,
    Reminder3Minutes: todo.Reminder3Minutes ?? 0,
    RemindersJSON: todo.RemindersJSON ?? null,
  };
  saveTodos(list);
  return true;
};

export const deleteTodo = async (TaskID) => {
  if (await ensureMode()) {
    try {
      const r = await fetch(`${API_BASE}/todos/${TaskID}`, { method: 'DELETE' });
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        throw new Error(errBody.error || r.statusText || 'Delete failed');
      }
      return true;
    } catch (e) {
      useApi = false;
      throw e;
    }
  }
  const list = loadTodos().filter((t) => String(t.TaskID) !== String(TaskID));
  saveTodos(list);
  return true;
};

export const toggleTodoCompletion = async (TaskID, completed) => {
  if (await ensureMode()) {
    try {
      const r = await fetch(`${API_BASE}/todos/${TaskID}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      if (!r.ok) throw new Error(r.statusText);
      return true;
    } catch (e) {
      useApi = false;
    }
  }
  const list = loadTodos();
  const i = list.findIndex((t) => String(t.TaskID) === String(TaskID));
  if (i === -1) return false;
  list[i].Completed = completed ? 1 : 0;
  list[i].CompletDateTime = completed ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
  saveTodos(list);
  return true;
};
