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

  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    type TEXT DEFAULT 'image',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS generated_images (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    type TEXT NOT NULL,
    config TEXT,
    user_id INTEGER,
    prompt TEXT,
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

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    template_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (template_id) REFERENCES templates(id),
    UNIQUE(user_id, template_id)
  );

  CREATE TABLE IF NOT EXISTS prompt_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    template_id TEXT,
    prompt TEXT NOT NULL,
    variables TEXT DEFAULT '{}',
    is_successful INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    image_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (image_id) REFERENCES generated_images(id),
    UNIQUE(user_id, image_id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    input_data TEXT NOT NULL,
    output_data TEXT,
    error_message TEXT,
    progress INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    started_at INTEGER,
    completed_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
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
try {
  db.exec(`ALTER TABLE generated_images ADD COLUMN prompt TEXT`);
} catch (e) { }
try {
  db.exec(`ALTER TABLE generated_images ADD COLUMN thumbnail_url TEXT`);
} catch (e) { }

// 添加模板的 male/female prompt 和默认配置
try {
  db.exec(`ALTER TABLE templates ADD COLUMN male_prompt TEXT`);
} catch (e) { }
try {
  db.exec(`ALTER TABLE templates ADD COLUMN female_prompt TEXT`);
} catch (e) { }
try {
  db.exec(`ALTER TABLE templates ADD COLUMN default_gender TEXT DEFAULT 'female'`);
} catch (e) { }
try {
  db.exec(`ALTER TABLE templates ADD COLUMN default_framing TEXT DEFAULT 'Close-up'`);
} catch (e) { }

// 添加文字和标题选项
try {
  db.exec(`ALTER TABLE templates ADD COLUMN has_text BOOLEAN DEFAULT 0`);
  console.log('✅ 已添加 has_text 字段');
} catch (e) { }
try {
  db.exec(`ALTER TABLE templates ADD COLUMN has_title BOOLEAN DEFAULT 0`);
  console.log('✅ 已添加 has_title 字段');
} catch (e) { }

// 添加作品公开状态字段（默认私有）
try {
  db.exec(`ALTER TABLE generated_images ADD COLUMN is_public INTEGER DEFAULT 0`);
  console.log('✅ 已添加 is_public 字段');
} catch (e) { }

// 性能优化：添加索引
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_images_user_created ON generated_images(user_id, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_history_user ON prompt_history(user_id, created_at DESC)`);
  console.log('✅ 数据库索引创建完成');
} catch (e) {
  console.error('索引创建失败:', e);
}

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
    const name = tag.name;
    const color = tag.color || '#6366f1';

    if (!name) {
      throw new Error('Tag name is required');
    }

    const stmt = db.prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)');
    stmt.run(id, name, color);
    return { id, name, color };
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
      malePrompt: row.male_prompt || null,
      femalePrompt: row.female_prompt || null,
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
      malePrompt: row.male_prompt || null,
      femalePrompt: row.female_prompt || null,
      defaultGender: row.default_gender || 'female',
      tags: JSON.parse(row.tags || '[]'),
      variables: JSON.parse(row.variables || '[]')
    };
  },

  create: (template) => {
    const stmt = db.prepare(`
      INSERT INTO templates (id, name, description, image_url, prompt, male_prompt, female_prompt, default_gender, tags, variables)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      template.id,
      template.name,
      template.description,
      template.imageUrl,
      template.prompt || '',
      template.malePrompt || null,
      template.femalePrompt || null,
      template.defaultGender || 'female',
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
      SET name = ?, description = ?, image_url = ?, prompt = ?, male_prompt = ?, female_prompt = ?, 
          default_gender = ?,
          tags = ?, variables = ?, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    stmt.run(
      updated.name,
      updated.description,
      updated.imageUrl,
      updated.prompt || '',
      updated.malePrompt || null,
      updated.femalePrompt || null,
      updated.defaultGender || 'female',
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
  save: async (image, userId = null) => {
    // 直接保存数据库记录，不再重复保存文件
    // 调用方应该先调用 saveImage() 保存文件，然后传入 url 和 thumbnailUrl
    const finalUrl = image.url;
    const thumbnailUrl = image.thumbnailUrl || null;

    const stmt = db.prepare(`
      INSERT INTO generated_images (id, url, thumbnail_url, type, config, user_id, prompt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(image.id, finalUrl, thumbnailUrl, image.type, JSON.stringify(image.config || {}), userId, image.prompt || null);
    return { ...image, url: finalUrl, thumbnailUrl, userId };
  },


  getAll: (limit = 50) => {
    return db.prepare('SELECT * FROM generated_images ORDER BY created_at DESC LIMIT ?').all(limit);
  },

  getByUserId: (userId, limit = 50) => {
    let query, params;

    if (userId === null || userId === undefined) {
      // 获取所有记录（管理员使用）
      query = `
        SELECT id, url, thumbnail_url, type, config, prompt, created_at, user_id, is_public
        FROM generated_images
        ORDER BY created_at DESC
        LIMIT ?
      `;
      params = [limit];
    } else {
      // 获取特定用户的记录
      query = `
        SELECT id, url, thumbnail_url, type, config, prompt, created_at, user_id, is_public
        FROM generated_images
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `;
      params = [userId, limit];
    }

    const rows = db.prepare(query).all(...params);
    return rows.map(row => ({
      id: row.id,
      url: row.url,
      thumbnailUrl: row.thumbnail_url,
      type: row.type,
      config: row.config ? JSON.parse(row.config) : null,
      prompt: row.prompt || null,
      isPublic: row.is_public === 1,
      timestamp: row.created_at * 1000
    }));
  },

  // 更新图片的 prompt 字段
  updatePrompt: (imageId, prompt) => {
    const stmt = db.prepare('UPDATE generated_images SET prompt = ? WHERE id = ?');
    return stmt.run(prompt, imageId).changes > 0;
  },

  // 获取图片详情（包含反馈）
  getById: (imageId) => {
    const row = db.prepare('SELECT * FROM generated_images WHERE id = ?').get(imageId);
    if (!row) return null;
    return {
      id: row.id,
      url: row.url,
      type: row.type,
      config: row.config ? JSON.parse(row.config) : null,
      prompt: row.prompt || null,
      userId: row.user_id,
      timestamp: row.created_at * 1000
    };
  },

  delete: (imageId) => {
    const stmt = db.prepare('DELETE FROM generated_images WHERE id = ?');
    stmt.run(imageId);
  },

  // 获取公开作品（社区画廊）
  getPublicImages: (limit = 50) => {
    const query = `
      SELECT gi.id, gi.url, gi.thumbnail_url, gi.type, gi.config, gi.prompt, 
             gi.created_at, gi.user_id, gi.is_public, u.username
      FROM generated_images gi
      LEFT JOIN users u ON gi.user_id = u.id
      WHERE gi.is_public = 1
      ORDER BY gi.created_at DESC
      LIMIT ?
    `;
    const rows = db.prepare(query).all(limit);
    return rows.map(row => ({
      id: row.id,
      url: row.url,
      thumbnailUrl: row.thumbnail_url,
      type: row.type,
      config: row.config ? JSON.parse(row.config) : null,
      prompt: row.prompt || null,
      timestamp: row.created_at * 1000,
      isPublic: true,
      username: row.username || '匿名用户'
    }));
  },

  // 设置作品公开状态
  setPublic: (imageId, isPublic, userId) => {
    // 验证所有权
    const image = db.prepare('SELECT user_id FROM generated_images WHERE id = ?').get(imageId);
    if (!image || image.user_id !== userId) {
      return { success: false, error: '无权操作此图片' };
    }

    const stmt = db.prepare('UPDATE generated_images SET is_public = ? WHERE id = ?');
    const result = stmt.run(isPublic ? 1 : 0, imageId);
    return { success: result.changes > 0 };
  }
};

// 资源管理 DB
export const assetDb = {
  getAll: () => {
    const rows = db.prepare('SELECT * FROM assets ORDER BY created_at DESC').all();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      url: row.url,
      thumbnailUrl: row.thumbnail_url,
      type: row.type || 'image',
      timestamp: row.created_at * 1000
    }));
  },

  add: (asset) => {
    const stmt = db.prepare(`
      INSERT INTO assets (id, name, url, thumbnail_url, type)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(asset.id, asset.name, asset.url, asset.thumbnailUrl, asset.type || 'image');
    return asset;
  },

  delete: (id) => {
    const stmt = db.prepare('DELETE FROM assets WHERE id = ?');
    stmt.run(id);
  },

  getById: (id) => {
    return db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
  }
};

// 收藏相关操作
export const favoriteDb = {
  // 添加收藏
  add: (userId, templateId) => {
    try {
      const stmt = db.prepare('INSERT INTO favorites (user_id, template_id) VALUES (?, ?)');
      stmt.run(userId, templateId);
      return true;
    } catch (e) {
      // UNIQUE 约束冲突说明已收藏
      return false;
    }
  },

  // 取消收藏
  remove: (userId, templateId) => {
    const stmt = db.prepare('DELETE FROM favorites WHERE user_id = ? AND template_id = ?');
    return stmt.run(userId, templateId).changes > 0;
  },

  // 检查是否已收藏
  isFavorited: (userId, templateId) => {
    const row = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND template_id = ?').get(userId, templateId);
    return !!row;
  },

  // 获取用户的收藏列表
  getByUserId: (userId) => {
    const rows = db.prepare(`
      SELECT t.*, f.created_at as favorited_at
      FROM favorites f
      JOIN templates t ON f.template_id = t.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).all(userId);
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      imageUrl: row.image_url,
      prompt: row.prompt || '',
      tags: JSON.parse(row.tags || '[]'),
      variables: JSON.parse(row.variables || '[]'),
      favoritedAt: row.favorited_at * 1000
    }));
  },

  // 获取模板的收藏数量
  getCount: (templateId) => {
    const row = db.prepare('SELECT COUNT(*) as count FROM favorites WHERE template_id = ?').get(templateId);
    return row.count;
  }
};

// 提示词历史相关操作
export const promptHistoryDb = {
  // 保存提示词历史
  save: (userId, prompt, templateId = null, variables = {}, isSuccessful = false) => {
    const stmt = db.prepare(`
      INSERT INTO prompt_history (user_id, template_id, prompt, variables, is_successful)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, templateId, prompt, JSON.stringify(variables), isSuccessful ? 1 : 0);
    return result.lastInsertRowid;
  },

  // 标记为成功
  markSuccessful: (id) => {
    const stmt = db.prepare('UPDATE prompt_history SET is_successful = 1 WHERE id = ?');
    return stmt.run(id).changes > 0;
  },

  // 获取用户的提示词历史
  getByUserId: (userId, limit = 50) => {
    const rows = db.prepare(`
      SELECT * FROM prompt_history
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit);
    return rows.map(row => ({
      id: row.id,
      templateId: row.template_id,
      prompt: row.prompt,
      variables: JSON.parse(row.variables || '{}'),
      isSuccessful: row.is_successful === 1,
      timestamp: row.created_at * 1000
    }));
  },

  // 获取成功的提示词历史
  getSuccessful: (userId, limit = 20) => {
    const rows = db.prepare(`
      SELECT * FROM prompt_history
      WHERE user_id = ? AND is_successful = 1
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit);
    return rows.map(row => ({
      id: row.id,
      templateId: row.template_id,
      prompt: row.prompt,
      variables: JSON.parse(row.variables || '{}'),
      timestamp: row.created_at * 1000
    }));
  },

  // 删除历史记录
  delete: (id, userId) => {
    const stmt = db.prepare('DELETE FROM prompt_history WHERE id = ? AND user_id = ?');
    return stmt.run(id, userId).changes > 0;
  }
};

// 任务队列相关操作
export const taskDb = {
  // 创建任务
  create: (taskId, userId, type, inputData) => {
    const stmt = db.prepare(`
      INSERT INTO tasks (id, user_id, type, input_data, status, progress)
      VALUES (?, ?, ?, ?, 'pending', 0)
    `);
    stmt.run(taskId, userId, type, JSON.stringify(inputData));
    return {
      id: taskId,
      userId,
      type,
      status: 'pending',
      progress: 0,
      inputData,
      createdAt: Date.now()
    };
  },

  // 获取待处理任务（按创建时间排序）
  getPending: (limit = 10) => {
    const rows = db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit);
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      status: row.status,
      inputData: JSON.parse(row.input_data),
      createdAt: row.created_at * 1000
    }));
  },

  // 开始处理任务
  startProcessing: (taskId) => {
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare(`
      UPDATE tasks SET status = 'processing', started_at = ?, progress = 10
      WHERE id = ? AND status = 'pending'
    `);
    return stmt.run(now, taskId).changes > 0;
  },

  // 更新进度
  updateProgress: (taskId, progress) => {
    const stmt = db.prepare('UPDATE tasks SET progress = ? WHERE id = ?');
    return stmt.run(progress, taskId).changes > 0;
  },

  // 完成任务
  complete: (taskId, outputData) => {
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare(`
      UPDATE tasks SET status = 'completed', output_data = ?, completed_at = ?, progress = 100
      WHERE id = ?
    `);
    return stmt.run(JSON.stringify(outputData), now, taskId).changes > 0;
  },

  // 任务失败
  fail: (taskId, errorMessage) => {
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare(`
      UPDATE tasks SET status = 'failed', error_message = ?, completed_at = ?
      WHERE id = ?
    `);
    return stmt.run(errorMessage, now, taskId).changes > 0;
  },

  // 获取任务详情
  getById: (taskId) => {
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      status: row.status,
      progress: row.progress,
      inputData: JSON.parse(row.input_data),
      outputData: row.output_data ? JSON.parse(row.output_data) : null,
      errorMessage: row.error_message,
      createdAt: row.created_at * 1000,
      startedAt: row.started_at ? row.started_at * 1000 : null,
      completedAt: row.completed_at ? row.completed_at * 1000 : null
    };
  },

  // 获取用户的任务列表
  getByUserId: (userId, limit = 50) => {
    const rows = db.prepare(`
      SELECT * FROM tasks
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit);
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      status: row.status,
      progress: row.progress,
      inputData: JSON.parse(row.input_data),
      outputData: row.output_data ? JSON.parse(row.output_data) : null,
      errorMessage: row.error_message,
      createdAt: row.created_at * 1000,
      startedAt: row.started_at ? row.started_at * 1000 : null,
      completedAt: row.completed_at ? row.completed_at * 1000 : null
    }));
  },

  // 获取用户活跃任务（pending 或 processing）
  getActiveTasks: (userId) => {
    const rows = db.prepare(`
      SELECT * FROM tasks
      WHERE user_id = ? AND status IN ('pending', 'processing')
      ORDER BY created_at ASC
    `).all(userId);
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      status: row.status,
      progress: row.progress,
      inputData: JSON.parse(row.input_data),
      createdAt: row.created_at * 1000,
      startedAt: row.started_at ? row.started_at * 1000 : null
    }));
  },

  // 获取队列统计
  getQueueStats: () => {
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM tasks
    `).get();
    return {
      pending: row.pending || 0,
      processing: row.processing || 0,
      completed: row.completed || 0,
      failed: row.failed || 0
    };
  },

  // 清理旧任务（保留最近7天）
  cleanup: (daysToKeep = 7) => {
    const cutoff = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
    const stmt = db.prepare(`
      DELETE FROM tasks
      WHERE status IN ('completed', 'failed') AND completed_at < ?
    `);
    return stmt.run(cutoff).changes;
  },

  // 重置卡住的任务（processing超过10分钟）
  resetStuckTasks: () => {
    const cutoff = Math.floor(Date.now() / 1000) - (10 * 60); // 10分钟
    const stmt = db.prepare(`
      UPDATE tasks SET status = 'pending', started_at = NULL, progress = 0
      WHERE status = 'processing' AND started_at < ?
    `);
    return stmt.run(cutoff).changes;
  }
};

// 反馈相关操作
export const feedbackDb = {
  // 添加或更新反馈
  upsert: (userId, imageId, rating) => {
    try {
      // 先尝试插入
      const stmt = db.prepare('INSERT INTO feedback (user_id, image_id, rating) VALUES (?, ?, ?)');
      stmt.run(userId, imageId, rating);
      return true;
    } catch (e) {
      // 如果已存在，则更新
      const stmt = db.prepare('UPDATE feedback SET rating = ? WHERE user_id = ? AND image_id = ?');
      return stmt.run(rating, userId, imageId).changes > 0;
    }
  },

  // 获取用户对某图片的反馈
  get: (userId, imageId) => {
    const row = db.prepare('SELECT rating FROM feedback WHERE user_id = ? AND image_id = ?').get(userId, imageId);
    return row ? row.rating : null;
  },

  // 获取图片的反馈统计
  getStats: (imageId) => {
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as likes,
        SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) as dislikes
      FROM feedback WHERE image_id = ?
    `).get(imageId);
    return {
      likes: row.likes || 0,
      dislikes: row.dislikes || 0
    };
  },

  // 获取模板的反馈统计（通过关联的图片）
  getTemplateStats: (templateId) => {
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN f.rating = 1 THEN 1 ELSE 0 END) as likes,
        SUM(CASE WHEN f.rating = -1 THEN 1 ELSE 0 END) as dislikes,
        COUNT(f.id) as total
      FROM feedback f
      JOIN generated_images g ON f.image_id = g.id
      WHERE json_extract(g.config, '$.templateId') = ?
    `).get(templateId);
    return {
      likes: row.likes || 0,
      dislikes: row.dislikes || 0,
      total: row.total || 0,
      satisfaction: row.total > 0 ? Math.round((row.likes / row.total) * 100) : null
    };
  }
};

export default db;
