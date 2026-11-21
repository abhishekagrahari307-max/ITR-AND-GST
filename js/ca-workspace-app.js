/* ===================================================
   Local-only generic compliance reminder controller.
   No client records, client identifiers or credentials.
   =================================================== */
(function () {
  'use strict';
  var W = window.TMWorkspace;
  if (!W) return;
  var STORE_KEY = 'tm-cahub-workspace-v2';
  var store = W.emptyStore(), editingTaskId = '', taskFilter = 'all', checklistTaskId = '';

  function setStatus(message) {
    var host = document.getElementById('storageStatus'); if (!host) return;
    host.textContent = message || ''; host.hidden = !message;
  }
  function load() {
    try {
      // Clear the earlier prototype storage, which accepted client data.
      window.localStorage.removeItem('tm-cahub-workspace');
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) store = W.normaliseStore(JSON.parse(raw));
    } catch (e) {
      store = W.emptyStore();
      setStatus('Browser storage could not be read. The page is showing an empty reminder list; existing data may still be present but unavailable. Check browser storage permissions before making changes.');
    }
  }
  function save() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(store)); setStatus(''); }
    catch (e) { setStatus('Save failed because browser storage is full or blocked. Your latest changes may not persist; export or resolve storage access before continuing.'); toast('Browser storage is full or blocked – changes may not persist.'); }
  }
  function esc(value) { return String(value === null || value === undefined ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function toast(message) {
    var host = document.getElementById('toastHost'); if (!host) return;
    var el = document.createElement('div'); el.className = 'tm-toast info'; el.textContent = message; host.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }
  function errors(hostId, list) {
    var host = document.getElementById(hostId); if (!host) return;
    host.innerHTML = (list || []).map(function (e) { return '<p class="form-error">' + esc(e) + '</p>'; }).join('');
  }
  function renderStats() {
    var s = W.stats(store), host = document.getElementById('wsStats'); if (!host) return;
    host.innerHTML = [['Open reminders', s.tasksOpen], ['Overdue', s.overdue], ['Due this week', s.dueThisWeek], ['Completed', s.done]].map(function (item) {
      return '<div class="stat-card"><span>' + esc(item[0]) + '</span><strong>' + item[1] + '</strong></div>';
    }).join('');
  }
  function visibleTasks() {
    var tasks = store.tasks.slice().sort(function (a, b) { return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') || a.createdAt.localeCompare(b.createdAt); });
    if (taskFilter === 'open') return tasks.filter(function (t) { return t.status !== 'done'; });
    if (taskFilter === 'overdue') return tasks.filter(function (t) { return W.isOverdue(t); });
    if (taskFilter === 'done') return tasks.filter(function (t) { return t.status === 'done'; });
    return tasks;
  }
  function renderTasks() {
    var body = document.getElementById('taskBody'), empty = document.getElementById('taskEmpty'); if (!body) return;
    var tasks = visibleTasks();
    body.innerHTML = tasks.map(function (task) {
      var progress = W.checklistProgress(task), overdue = W.isOverdue(task), cls = task.status === 'done' ? 'ok' : overdue ? 'bad' : 'warn';
      return '<tr><td><strong>' + esc(task.title) + '</strong><div class="sub">Checklist: ' + progress.done + '/' + progress.total + ' complete</div></td>' +
        '<td>' + esc(W.taskCategoryLabel(task.category)) + '</td><td><span class="pill ' + cls + '">' + esc(W.taskStatusLabel(task.status)) + (overdue ? ' · overdue' : '') + '</span></td>' +
        '<td>' + (task.dueDate ? esc(task.dueDate) : '<span class="sub">—</span>') + '</td><td class="actions">' +
        '<button type="button" class="btn-icon" data-edit-task="' + esc(task.id) + '">Edit</button> <button type="button" class="btn-icon" data-open-task="' + esc(task.id) + '">Checklist</button> <button type="button" class="btn-icon danger" data-delete-task="' + esc(task.id) + '">Delete</button></td></tr>';
    }).join('');
    if (empty) { empty.hidden = tasks.length > 0; empty.textContent = store.tasks.length ? 'No reminders match this filter.' : 'No reminders yet. Add a generic practice reminder below; this is not a client record system.'; }
    Array.prototype.forEach.call(body.querySelectorAll('[data-edit-task]'), function (btn) {
      btn.addEventListener('click', function () {
        var task = W.findTask(store, btn.getAttribute('data-edit-task')); if (!task) return;
        editingTaskId = task.id; document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskCategory').value = task.category; document.getElementById('taskStatus').value = task.status;
        document.getElementById('taskDueDate').value = task.dueDate; document.getElementById('taskFormTitle').textContent = 'Edit reminder';
        document.getElementById('taskSubmit').textContent = 'Save changes'; document.getElementById('taskCancel').hidden = false;
        document.getElementById('taskTitle').focus();
      });
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-delete-task]'), function (btn) {
      btn.addEventListener('click', function () {
        var task = W.findTask(store, btn.getAttribute('data-delete-task')); if (!task || !window.confirm('Delete reminder "' + task.title + '"?')) return;
        W.deleteTask(store, task.id); save(); renderAll(); toast('Reminder deleted.');
      });
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-open-task]'), function (btn) { btn.addEventListener('click', function () { openChecklist(btn.getAttribute('data-open-task')); }); });
  }
  function resetTaskForm() {
    editingTaskId = ''; var form = document.getElementById('taskForm'); if (form) form.reset();
    document.getElementById('taskFormTitle').textContent = 'Add a reminder'; document.getElementById('taskSubmit').textContent = 'Add reminder';
    document.getElementById('taskCancel').hidden = true; errors('taskErrors', []);
  }
  function openChecklist(id) { checklistTaskId = id; renderChecklist(); var panel = document.getElementById('checklistPanel'); if (panel) { panel.hidden = false; panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }
  function renderChecklist() {
    var panel = document.getElementById('checklistPanel'), body = document.getElementById('checklistBody'); if (!panel || !body) return;
    var task = W.findTask(store, checklistTaskId); if (!task) { panel.hidden = true; return; }
    var progress = W.checklistProgress(task); document.getElementById('checklistTitle').textContent = task.title + ' — checklist (' + progress.done + '/' + progress.total + ')';
    body.innerHTML = task.checklist.map(function (item) { return '<label class="check-row"><input type="checkbox" data-check="' + esc(item.id) + '"' + (item.done ? ' checked' : '') + '> ' + esc(item.label) + '</label>'; }).join('') || '<p class="sub">No checklist items yet.</p>';
    Array.prototype.forEach.call(body.querySelectorAll('[data-check]'), function (box) { box.addEventListener('change', function () { W.toggleChecklistItem(store, task.id, box.getAttribute('data-check')); save(); renderChecklist(); renderTasks(); renderStats(); }); });
  }
  function renderActivity() {
    var body = document.getElementById('activityBody'), empty = document.getElementById('activityEmpty'); if (!body) return;
    body.innerHTML = store.activity.slice(0, 50).map(function (entry) { return '<tr><td>' + esc(entry.at.slice(0, 16).replace('T', ' ')) + '</td><td>' + esc(entry.action) + '</td><td>' + esc(entry.detail) + '</td></tr>'; }).join('');
    if (empty) empty.hidden = store.activity.length > 0;
  }
  function renderAll() {
    renderStats(); renderTasks(); renderActivity();
    var panel = document.getElementById('checklistPanel'); if (panel && !panel.hidden) renderChecklist();
  }
  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function init() {
    load();
    document.getElementById('taskCategory').innerHTML = W.TASK_CATEGORIES.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.label) + '</option>'; }).join('');
    document.getElementById('taskStatus').innerHTML = W.TASK_STATUSES.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.label) + '</option>'; }).join('');
    document.getElementById('taskForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = { title: document.getElementById('taskTitle').value, category: document.getElementById('taskCategory').value,
        status: document.getElementById('taskStatus').value, dueDate: document.getElementById('taskDueDate').value };
      var wasEditing = !!editingTaskId, result = wasEditing ? W.updateTask(store, editingTaskId, input) : W.addTask(store, input);
      if (!result.ok) { errors('taskErrors', result.errors); return; }
      save(); resetTaskForm(); renderAll(); toast(wasEditing ? 'Reminder updated.' : 'Reminder added.');
    });
    document.getElementById('taskCancel').addEventListener('click', resetTaskForm);
    document.getElementById('taskFilter').addEventListener('change', function (event) { taskFilter = event.target.value; renderTasks(); });
    document.getElementById('closeChecklist').addEventListener('click', function () { document.getElementById('checklistPanel').hidden = true; });
    document.getElementById('addCheckItem').addEventListener('click', function () {
      var input = document.getElementById('newCheckItem'); if (!W.addChecklistItem(store, checklistTaskId, input.value)) { toast('Type a checklist item first.'); return; }
      input.value = ''; save(); renderChecklist(); renderTasks();
    });
    document.getElementById('exportBtn').addEventListener('click', function () { download('practice-reminders-' + W.todayISO() + '.json', W.exportJSON(store)); toast('Reminder backup downloaded.'); });
    document.getElementById('importFile').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0]; if (!file) return;
      var reader = new FileReader(); reader.onload = function () {
        var result = W.importJSON(String(reader.result || '')); if (!result.ok) { toast('Import failed: ' + result.errors.join(' ')); return; }
        if (!window.confirm('Replace current reminders with this backup?')) return;
        store = result.store; save(); renderAll(); toast('Reminder backup restored.');
      }; reader.readAsText(file); event.target.value = '';
    });
    document.getElementById('wipeBtn').addEventListener('click', function () {
      if (!window.confirm('Delete all practice reminders and activity in this browser?')) return;
      store = W.emptyStore(); save(); resetTaskForm(); document.getElementById('checklistPanel').hidden = true; renderAll(); toast('Reminder data cleared.');
    });
    renderAll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
