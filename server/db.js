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
    prompt TEXT NOT NULL DEFAULT '',
    tags TEXT DEFAULT '[]',
    variables TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6366f1',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
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
} catch (e) { }
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN role TEXT DEFAULT 'user'`);
} catch (e) { }
try {
  db.exec(`ALTER TABLE templates ADD COLUMN prompt TEXT NOT NULL DEFAULT ''`);
} catch (e) { }
try {
  db.exec(`ALTER TABLE templates ADD COLUMN tags TEXT DEFAULT '[]'`);
} catch (e) { }
try {
  db.exec(`ALTER TABLE templates ADD COLUMN variables TEXT DEFAULT '[]'`);
} catch (e) { }

// 插入默认标签（如果不存在）
const defaultTags = [
  { id: 'model', name: '模特试戴', color: '#6366f1' },
  { id: 'poster', name: '海报', color: '#ec4899' },
  { id: 'social', name: '社媒', color: '#14b8a6' },
  { id: 'ecommerce', name: '电商', color: '#f59e0b' }
];
defaultTags.forEach(tag => {
  try {
    db.prepare('INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, ?, ?)').run(tag.id, tag.name, tag.color);
  } catch (e) { }
});

// 标签相关操作
export const tagDb = {
  getAll: () => {
    return db.prepare('SELECT * FROM tags ORDER BY created_at ASC').all();
  },

  create: (tag) => {
    const id = tag.id || Date.now().toString();
    const stmt = db.prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)');
    stmt.run(id, tag.name, tag.color || '#6366f1');
    return { id, ...tag };
  },

  update: (id, updates) => {
    const stmt = db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?');
    const result = stmt.run(updates.name, updates.color, id);
    if (result.changes === 0) return null;
    return { id, ...updates };
  },

  delete: (id) => {
    const stmt = db.prepare('DELETE FROM tags WHERE id = ?');
    return stmt.run(id).changes > 0;
  }
};

// 模板相关操作
export const templateDb = {
  getAll: (tagFilter = null) => {
    const rows = db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all();
    let results = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.image_url,
      prompt: row.prompt || '',
      tags: JSON.parse(row.tags || '[]'),
      variables: JSON.parse(row.variables || '[]')
    }));

    // 如果有标签筛选，只返回包含该标签的模板
    if (tagFilter) {
      results = results.filter(tpl => tpl.tags.includes(tagFilter));
    }
    return results;
  },

  getById: (id) => {
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.image_url,
      prompt: row.prompt || '',
      tags: JSON.parse(row.tags || '[]'),
      variables: JSON.parse(row.variables || '[]')
    };
  },

  create: (template) => {
    const stmt = db.prepare(`
      INSERT INTO templates (id, name, description, image_url, prompt, tags, variables)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      template.id,
      template.name,
      template.description,
      template.imageUrl,
      template.prompt || '',
      JSON.stringify(template.tags || []),
      JSON.stringify(template.variables || [])
    );
    return template;
  },

  update: (id, updates) => {
    const current = templateDb.getById(id);
    if (!current) return null;

    const updated = { ...current, ...updates };
    const stmt = db.prepare(`
      UPDATE templates
      SET name = ?, description = ?, image_url = ?, prompt = ?, tags = ?, variables = ?, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    stmt.run(
      updated.name,
      updated.description,
      updated.imageUrl,
      updated.prompt || '',
      JSON.stringify(updated.tags || []),
      JSON.stringify(updated.variables || []),
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
  },

  updatePassword: (userId, passwordHash) => {
    const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    return stmt.run(passwordHash, userId).changes > 0;
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
