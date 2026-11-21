/* ===================================================
   TaxMitra – generic local compliance task list
   This is NOT a client database or secure workspace.
   It stores only user-authored reminder tasks in this
   browser and starts empty. Do not enter client names,
   identifiers, records, credentials or sensitive details.
   =================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TMWorkspace = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var STORE_VERSION = 2;
  var TASK_CATEGORIES = [
    { id: 'itr', label: 'ITR / income tax' }, { id: 'gst', label: 'GST' },
    { id: 'tds', label: 'TDS / TCS' }, { id: 'audit', label: 'Audit' },
    { id: 'roc', label: 'MCA / ROC' }, { id: 'payroll', label: 'Payroll' },
    { id: 'other', label: 'Other' }
  ];
  var TASK_STATUSES = [
    { id: 'todo', label: 'To do' }, { id: 'doing', label: 'In progress' },
    { id: 'review', label: 'In review' }, { id: 'done', label: 'Done' }
  ];
  var DEFAULT_CHECKLIST = ['Review applicable rules', 'Prepare working paper', 'Second-person review', 'Complete any required official portal action'];

  function uid(prefix) { return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function isISODate(value) {
    var text = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    var p = text.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
  }
  function emptyStore() { return { version: STORE_VERSION, tasks: [], activity: [] }; }
  function isRecord(v) { return v && typeof v === 'object' && typeof v.id === 'string'; }
  function normaliseStore(raw) {
    var store = emptyStore();
    // Deliberately do not migrate/import legacy client records.
    if (!raw || typeof raw !== 'object') return store;
    if (Array.isArray(raw.tasks)) store.tasks = raw.tasks.filter(isRecord).map(function (task) {
      return { id: task.id, title: String(task.title || ''), category: String(task.category || 'other'),
        status: String(task.status || 'todo'), dueDate: String(task.dueDate || ''),
        checklist: Array.isArray(task.checklist) ? task.checklist : [], createdAt: String(task.createdAt || new Date().toISOString()),
        updatedAt: String(task.updatedAt || new Date().toISOString()) };
    });
    if (Array.isArray(raw.activity)) store.activity = raw.activity.filter(isRecord).slice(0, 500);
    return store;
  }
  function logActivity(store, action, detail) {
    store.activity.unshift({ id: uid('act'), at: new Date().toISOString(), action: action, detail: String(detail || '') });
    if (store.activity.length > 500) store.activity.length = 500;
  }
  function validateTask(input) {
    var errors = [];
    if (!String((input && input.title) || '').trim()) errors.push('Reminder title is required.');
    var due = String((input && input.dueDate) || '').trim();
    if (due && !isISODate(due)) errors.push('Due date must be a real date (YYYY-MM-DD).');
    var category = String((input && input.category) || 'other');
    if (!TASK_CATEGORIES.some(function (c) { return c.id === category; })) errors.push('Unknown task category.');
    var status = String((input && input.status) || 'todo');
    if (!TASK_STATUSES.some(function (s) { return s.id === status; })) errors.push('Unknown task status.');
    return { ok: errors.length === 0, errors: errors };
  }
  function findTask(store, id) { return store.tasks.filter(function (t) { return t.id === id; })[0] || null; }
  function addTask(store, input) {
    var check = validateTask(input); if (!check.ok) return { ok: false, errors: check.errors };
    var checklist = Array.isArray(input.checklist) && input.checklist.length
      ? input.checklist.map(function (item) { return { id: uid('chk'), label: String(item.label || item || '').trim(), done: !!item.done }; }).filter(function (i) { return i.label; })
      : DEFAULT_CHECKLIST.map(function (label) { return { id: uid('chk'), label: label, done: false }; });
    var task = { id: uid('task'), title: String(input.title).trim(), category: String(input.category || 'other'), status: String(input.status || 'todo'),
      dueDate: String(input.dueDate || '').trim(), checklist: checklist, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    store.tasks.push(task); logActivity(store, 'task.add', task.title); return { ok: true, task: task };
  }
  function updateTask(store, id, input) {
    var task = findTask(store, id); if (!task) return { ok: false, errors: ['Reminder not found.'] };
    var merged = { title: input.title !== undefined ? input.title : task.title, dueDate: input.dueDate !== undefined ? input.dueDate : task.dueDate,
      category: input.category !== undefined ? input.category : task.category, status: input.status !== undefined ? input.status : task.status };
    var check = validateTask(merged); if (!check.ok) return { ok: false, errors: check.errors };
    task.title = String(merged.title).trim(); task.dueDate = String(merged.dueDate).trim(); task.category = merged.category; task.status = merged.status; task.updatedAt = new Date().toISOString();
    logActivity(store, 'task.update', task.title); return { ok: true, task: task };
  }
  function deleteTask(store, id) {
    var index = store.tasks.findIndex(function (t) { return t.id === id; }); if (index < 0) return false;
    var title = store.tasks[index].title; store.tasks.splice(index, 1); logActivity(store, 'task.delete', title); return true;
  }
  function toggleChecklistItem(store, taskId, itemId) {
    var task = findTask(store, taskId); if (!task) return false;
    var item = task.checklist.filter(function (c) { return c.id === itemId; })[0]; if (!item) return false;
    item.done = !item.done; task.updatedAt = new Date().toISOString(); logActivity(store, 'task.checklist', task.title + ' · ' + item.label); return true;
  }
  function addChecklistItem(store, taskId, label) {
    var task = findTask(store, taskId), text = String(label || '').trim(); if (!task || !text) return null;
    var item = { id: uid('chk'), label: text, done: false }; task.checklist.push(item); task.updatedAt = new Date().toISOString();
    logActivity(store, 'task.checklist.add', task.title + ' · ' + text); return item;
  }
  function checklistProgress(task) {
    if (!task || !task.checklist.length) return { done: 0, total: 0, pct: 0 };
    var done = task.checklist.filter(function (c) { return c.done; }).length;
    return { done: done, total: task.checklist.length, pct: Math.round(done / task.checklist.length * 100) };
  }
  function isOverdue(task, today) { return !!task && task.status !== 'done' && !!task.dueDate && task.dueDate < (today || todayISO()); }
  function dueSoon(tasks, today, days) {
    var day = today || todayISO(), window = typeof days === 'number' ? days : 7, limit = new Date(day + 'T00:00:00Z');
    limit.setUTCDate(limit.getUTCDate() + window); var end = limit.toISOString().slice(0, 10);
    return tasks.filter(function (task) { return task.status !== 'done' && task.dueDate && task.dueDate >= day && task.dueDate <= end; }).sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); });
  }
  function stats(store, today) {
    var open = store.tasks.filter(function (t) { return t.status !== 'done'; });
    return { tasksTotal: store.tasks.length, tasksOpen: open.length, overdue: open.filter(function (t) { return isOverdue(t, today); }).length,
      dueThisWeek: dueSoon(store.tasks, today, 7).length, done: store.tasks.filter(function (t) { return t.status === 'done'; }).length };
  }
  function taskCategoryLabel(id) { for (var i = 0; i < TASK_CATEGORIES.length; i++) if (TASK_CATEGORIES[i].id === id) return TASK_CATEGORIES[i].label; return id; }
  function taskStatusLabel(id) { for (var i = 0; i < TASK_STATUSES.length; i++) if (TASK_STATUSES[i].id === id) return TASK_STATUSES[i].label; return id; }
  function exportJSON(store) { return JSON.stringify(store, null, 2); }
  function importJSON(text) {
    var parsed; try { parsed = JSON.parse(text); } catch (e) { return { ok: false, errors: ['File is not valid JSON.'] }; }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) return { ok: false, errors: ['Backup must contain a tasks array.'] };
    var store = normaliseStore(parsed);
    if (parsed.tasks.length !== store.tasks.length) return { ok: false, errors: ['Backup contains malformed reminder records.'] };
    logActivity(store, 'workspace.import', parsed.tasks.length + ' reminders'); return { ok: true, store: store };
  }
  return { STORE_VERSION: STORE_VERSION, TASK_CATEGORIES: TASK_CATEGORIES, TASK_STATUSES: TASK_STATUSES, DEFAULT_CHECKLIST: DEFAULT_CHECKLIST,
    emptyStore: emptyStore, normaliseStore: normaliseStore, validateTask: validateTask, addTask: addTask, updateTask: updateTask, deleteTask: deleteTask,
    findTask: findTask, toggleChecklistItem: toggleChecklistItem, addChecklistItem: addChecklistItem, checklistProgress: checklistProgress,
    isOverdue: isOverdue, dueSoon: dueSoon, stats: stats, taskCategoryLabel: taskCategoryLabel, taskStatusLabel: taskStatusLabel,
    exportJSON: exportJSON, importJSON: importJSON, todayISO: todayISO, isISODate: isISODate };
});
