/* TaxMitra server – persistence.

   Two interchangeable drivers:
     • sqlite  – node:sqlite (Node >= 22.5, built in, no dependencies)
     • file    – a single JSON file with atomic writes (Node >= 18)

   The file driver exists so the app can still be deployed on a runtime without
   node:sqlite. Both expose the same tiny interface, so route code never cares
   which one is active. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function nowMs() {
  return Date.now();
}

/* ------------------------------------------------------------------ SQLite */

function trySqlite() {
  try {
    // eslint-disable-next-line global-require
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.close();
    return DatabaseSync;
  } catch (e) {
    return null;
  }
}

function createSqliteStore(file) {
  const DatabaseSync = trySqlite();
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL,
      last_login INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      jti TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      user_agent TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS docs (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, key)
    );
    CREATE INDEX IF NOT EXISTS docs_user ON docs(user_id);
    CREATE TABLE IF NOT EXISTS ai_usage (
      day TEXT NOT NULL,
      ip TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, ip)
    );
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      meta TEXT NOT NULL DEFAULT '{}',
      at INTEGER NOT NULL
    );
  `);

  const q = {
    insertUser: db.prepare('INSERT INTO users (id,email,name,password_hash,role,created_at) VALUES (?,?,?,?,?,?)'),
    byEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    countUsers: db.prepare('SELECT COUNT(*) AS c FROM users'),
    touchLogin: db.prepare('UPDATE users SET last_login = ? WHERE id = ?'),
    setPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (jti,user_id,created_at,expires_at,user_agent) VALUES (?,?,?,?,?)'),
    session: db.prepare('SELECT * FROM sessions WHERE jti = ?'),
    revokeSession: db.prepare('UPDATE sessions SET revoked = 1 WHERE jti = ?'),
    revokeAll: db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?'),
    upsertDoc: db.prepare(`
      INSERT INTO docs (user_id,key,value,updated_at,version) VALUES (?,?,?,?,1)
      ON CONFLICT(user_id,key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, version = docs.version + 1
    `),
    getDoc: db.prepare('SELECT key,value,updated_at,version FROM docs WHERE user_id = ? AND key = ?'),
    listDocs: db.prepare('SELECT key,updated_at,version,length(value) AS size FROM docs WHERE user_id = ? ORDER BY key'),
    deleteDoc: db.prepare('DELETE FROM docs WHERE user_id = ? AND key = ?'),
    deleteAllDocs: db.prepare('DELETE FROM docs WHERE user_id = ?'),
    userBytes: db.prepare('SELECT COALESCE(SUM(length(value)),0) AS bytes FROM docs WHERE user_id = ?'),
    bumpAi: db.prepare(`
      INSERT INTO ai_usage (day,ip,count) VALUES (?,?,1)
      ON CONFLICT(day,ip) DO UPDATE SET count = ai_usage.count + 1
    `),
    aiDay: db.prepare('SELECT COALESCE(SUM(count),0) AS c FROM ai_usage WHERE day = ?'),
    aiIp: db.prepare('SELECT count FROM ai_usage WHERE day = ? AND ip = ?'),
    audit: db.prepare('INSERT INTO audit (id,user_id,action,meta,at) VALUES (?,?,?,?,?)'),
    auditList: db.prepare('SELECT id,user_id,action,at FROM audit ORDER BY at DESC LIMIT ?'),
  };

  return {
    driver: 'sqlite',
    file,
    createUser(user) {
      q.insertUser.run(user.id, user.email, user.name || '', user.passwordHash, user.role || 'user', user.createdAt || nowMs());
      return this.findUserByEmail(user.email);
    },
    findUserByEmail(email) {
      const row = q.byEmail.get(String(email).toLowerCase());
      return row || null;
    },
    findUserById(id) {
      return q.byId.get(id) || null;
    },
    countUsers() {
      return q.countUsers.get().c;
    },
    touchLogin(id) {
      q.touchLogin.run(nowMs(), id);
    },
    setPassword(id, hash) {
      q.setPassword.run(hash, id);
    },
    createSession(session) {
      q.insertSession.run(session.jti, session.userId, session.createdAt, session.expiresAt, session.userAgent || '');
    },
    getSession(jti) {
      return q.session.get(jti) || null;
    },
    revokeSession(jti) {
      q.revokeSession.run(jti);
    },
    revokeAllSessions(userId) {
      q.revokeAll.run(userId);
    },
    putDoc(userId, key, value, updatedAt) {
      q.upsertDoc.run(userId, key, value, updatedAt || nowMs());
      const row = q.getDoc.get(userId, key);
      return row;
    },
    getDoc(userId, key) {
      return q.getDoc.get(userId, key) || null;
    },
    listDocs(userId) {
      return q.listDocs.all(userId);
    },
    deleteDoc(userId, key) {
      q.deleteDoc.run(userId, key);
    },
    deleteAllDocs(userId) {
      q.deleteAllDocs.run(userId);
    },
    userBytes(userId) {
      return q.userBytes.get(userId).bytes;
    },
    bumpAi(day, ip) {
      q.bumpAi.run(day, ip);
      return {
        ip: q.aiIp.get(day, ip) ? q.aiIp.get(day, ip).count : 0,
        global: q.aiDay.get(day).c,
      };
    },
    audit(userId, action, meta) {
      q.audit.run(crypto.randomUUID(), userId || null, action, JSON.stringify(meta || {}), nowMs());
    },
    recentAudit(limit) {
      return q.auditList.all(limit || 50);
    },
    close() {
      try { db.close(); } catch (e) { /* already closed */ }
    },
  };
}

/* -------------------------------------------------------------------- File */

function createFileStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const empty = { users: {}, sessions: {}, docs: {}, aiUsage: {}, audit: [] };
  let state;
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    state = JSON.parse(JSON.stringify(empty));
  }
  for (const key of Object.keys(empty)) {
    if (state[key] === undefined) state[key] = JSON.parse(JSON.stringify(empty[key]));
  }

  let timer = null;
  let dirty = false;

  function flush() {
    if (!dirty) return;
    dirty = false;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, file);
  }

  function save() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => { timer = null; flush(); }, 25);
    if (timer.unref) timer.unref();
  }

  function publicUser(u) {
    return u ? { id: u.id, email: u.email, name: u.name, role: u.role, created_at: u.created_at, last_login: u.last_login } : null;
  }

  return {
    driver: 'file',
    file,
    createUser(user) {
      const email = String(user.email).toLowerCase();
      state.users[user.id] = {
        id: user.id,
        email,
        name: user.name || '',
        password_hash: user.passwordHash,
        role: user.role || 'user',
        created_at: user.createdAt || nowMs(),
        last_login: null,
      };
      save();
      return publicUser(state.users[user.id]);
    },
    findUserByEmail(email) {
      const target = String(email).toLowerCase();
      const found = Object.values(state.users).find((u) => u.email === target);
      return found ? found : null;
    },
    findUserById(id) {
      return state.users[id] || null;
    },
    countUsers() {
      return Object.keys(state.users).length;
    },
    touchLogin(id) {
      if (state.users[id]) { state.users[id].last_login = nowMs(); save(); }
    },
    setPassword(id, hash) {
      if (state.users[id]) { state.users[id].password_hash = hash; save(); }
    },
    createSession(session) {
      state.sessions[session.jti] = {
        jti: session.jti,
        user_id: session.userId,
        created_at: session.createdAt,
        expires_at: session.expiresAt,
        revoked: 0,
        user_agent: session.userAgent || '',
      };
      save();
    },
    getSession(jti) {
      return state.sessions[jti] || null;
    },
    revokeSession(jti) {
      if (state.sessions[jti]) { state.sessions[jti].revoked = 1; save(); }
    },
    revokeAllSessions(userId) {
      Object.values(state.sessions).forEach((s) => { if (s.user_id === userId) s.revoked = 1; });
      save();
    },
    putDoc(userId, key, value, updatedAt) {
      const docs = state.docs[userId] || (state.docs[userId] = {});
      const existing = docs[key];
      docs[key] = {
        key,
        value,
        updated_at: updatedAt || nowMs(),
        version: existing ? existing.version + 1 : 1,
      };
      save();
      return docs[key];
    },
    getDoc(userId, key) {
      const docs = state.docs[userId];
      if (!docs || !docs[key]) return null;
      return docs[key];
    },
    listDocs(userId) {
      const docs = state.docs[userId] || {};
      return Object.values(docs)
        .map((d) => ({ key: d.key, updated_at: d.updated_at, version: d.version, size: Buffer.byteLength(d.value) }))
        .sort((a, b) => (a.key < b.key ? -1 : 1));
    },
    deleteDoc(userId, key) {
      if (state.docs[userId] && state.docs[userId][key]) {
        delete state.docs[userId][key];
        save();
      }
    },
    deleteAllDocs(userId) {
      delete state.docs[userId];
      save();
    },
    userBytes(userId) {
      const docs = state.docs[userId] || {};
      return Object.values(docs).reduce((sum, d) => sum + Buffer.byteLength(d.value), 0);
    },
    bumpAi(day, ip) {
      const bucket = state.aiUsage[day] || (state.aiUsage[day] = {});
      bucket[ip] = (bucket[ip] || 0) + 1;
      const global = Object.values(bucket).reduce((a, b) => a + b, 0);
      // Keep the file bounded: drop days older than 3.
      const days = Object.keys(state.aiUsage).sort();
      while (days.length > 3) delete state.aiUsage[days.shift()];
      save();
      return { ip: bucket[ip], global };
    },
    audit(userId, action, meta) {
      state.audit.unshift({ id: crypto.randomUUID(), user_id: userId || null, action, meta: meta || {}, at: nowMs() });
      if (state.audit.length > 500) state.audit.length = 500;
      save();
    },
    recentAudit(limit) {
      return state.audit.slice(0, limit || 50);
    },
    close() {
      flush();
    },
  };
}

function open(dataDir, opts) {
  const options = opts || {};
  fs.mkdirSync(dataDir, { recursive: true });
  if (options.driver === 'file') return createFileStore(path.join(dataDir, 'taxmitra.json'));
  if (trySqlite()) return createSqliteStore(path.join(dataDir, 'taxmitra.db'));
  return createFileStore(path.join(dataDir, 'taxmitra.json'));
}

module.exports = { open, publicUser: (u) => (u ? { id: u.id, email: u.email, name: u.name, role: u.role, created_at: u.created_at, last_login: u.last_login } : null) };
