import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, 'lyra.db'));

// 初始化数据库表
db.exec(`
  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS generated_images (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT,
    user_id INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    user_id INTEGER,
    role TEXT DEFAULT 'user',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// 迁移：为旧表添加新列（如果不存在）
try {
  db.exec(`ALTER TABLE generated_images ADD COLUMN user_id INTEGER`);
} catch (e) {
  // 列已存在，忽略错误
}
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN user_id INTEGER`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN role TEXT DEFAULT 'user'`);
} catch (e) {}

// 模板相关操作
export const templateDb = {
  getAll: () => {
    const rows = db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.image_url,
      config: JSON.parse(row.config)
    }));
  },

  getById: (id) => {
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.image_url,
      config: JSON.parse(row.config)
    };
  },

  create: (template) => {
    const stmt = db.prepare(`
      INSERT INTO templates (id, name, description, image_url, config)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      template.id,
      template.name,
      template.description,
      template.imageUrl,
      JSON.stringify(template.config)
    );
    return template;
  },

  update: (id, updates) => {
    const current = templateDb.getById(id);
    if (!current) return null;

    const updated = { ...current, ...updates };
    const stmt = db.prepare(`
      UPDATE templates
      SET name = ?, description = ?, image_url = ?, config = ?, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    stmt.run(
      updated.name,
      updated.description,
      updated.imageUrl,
      JSON.stringify(updated.config),
      id
    );
    return updated;
  },

  delete: (id) => {
    const stmt = db.prepare('DELETE FROM templates WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
};

// 用户相关操作
export const userDb = {
  create: (username, passwordHash) => {
    const stmt = db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, 'user')
    `);
    const result = stmt.run(username, passwordHash);
    return { id: result.lastInsertRowid, username, role: 'user' };
  },

  findByUsername: (username) => {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  },

  findById: (id) => {
    return db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id);
  },

  usernameExists: (username) => {
    const row = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    return !!row;
  }
};

// Session 相关操作
export const sessionDb = {
  create: (token, username, expiresInHours = 24, userId = null, role = 'admin') => {
    const expiresAt = Math.floor(Date.now() / 1000) + (expiresInHours * 60 * 60);
    const stmt = db.prepare(`
      INSERT INTO sessions (token, username, user_id, role, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(token, username, userId, role, expiresAt);
    return { token, username, userId, role, expiresAt };
  },

  validate: (token) => {
    const now = Math.floor(Date.now() / 1000);
    const row = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, now);
    return row ? {
      username: row.username,
      userId: row.user_id,
      role: row.role || 'admin',
      expiresAt: row.expires_at
    } : null;
  },

  delete: (token) => {
    const stmt = db.prepare('DELETE FROM sessions WHERE token = ?');
    return stmt.run(token).changes > 0;
  },

  cleanup: () => {
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
    return stmt.run(now).changes;
  }
};

// 生成图片记录
export const imageDb = {
  save: (image, userId = null) => {
    const stmt = db.prepare(`
      INSERT INTO generated_images (id, url, type, config, user_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(image.id, image.url, image.type, JSON.stringify(image.config || {}), userId);
    return { ...image, userId };
  },

  getAll: (limit = 50) => {
    return db.prepare('SELECT * FROM generated_images ORDER BY created_at DESC LIMIT ?').all(limit);
  },

  getByUserId: (userId, limit = 50) => {
    const rows = db.prepare(`
      SELECT id, url, type, config, created_at
      FROM generated_images
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit);
    return rows.map(row => ({
      id: row.id,
      url: row.url,
      type: row.type,
      config: row.config ? JSON.parse(row.config) : null,
      timestamp: row.created_at * 1000
    }));
  }
};

export default db;
