import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { templateDb, sessionDb, imageDb } from './db.js';
import { login, logout, register, authMiddleware, adminMiddleware } from './auth.js';
import { generateEyewearImage, generatePosterImage, getPromptSuggestions } from './gemini.js';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 定期清理过期 session
setInterval(() => {
  const cleaned = sessionDb.cleanup();
  if (cleaned > 0) {
    console.log(`Cleaned ${cleaned} expired sessions`);
  }
}, 60 * 60 * 1000); // 每小时清理一次

// ========== 认证 API ==========

// 用户注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '请提供用户名和密码' });
    }

    const result = await register(username, password);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      token: result.token,
      user: result.user,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

// 登录（支持普通用户和管理员）
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '请提供用户名和密码' });
    }

    const result = await login(username, password);
    if (!result) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    res.json({
      success: true,
      token: result.token,
      user: result.user,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

// 登出
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization.substring(7);
  logout(token);
  res.json({ success: true });
});

// 验证登录状态
app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.userId,
      username: req.user.username,
      role: req.user.role
    }
  });
});

// ========== 模板 API ==========

// 获取所有模板（公开）
app.get('/api/templates', (req, res) => {
  try {
    const templates = templateDb.getAll();
    res.json(templates);
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: '获取模板失败' });
  }
});

// 获取单个模板
app.get('/api/templates/:id', (req, res) => {
  try {
    const template = templateDb.getById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: '模板不存在' });
    }
    res.json(template);
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ error: '获取模板失败' });
  }
});

// 创建模板（需要管理员）
app.post('/api/templates', adminMiddleware, (req, res) => {
  try {
    const { id, name, description, imageUrl, config } = req.body;

    if (!id || !imageUrl || !config) {
      return res.status(400).json({ error: '缺少必要字段' });
    }

    const template = templateDb.create({
      id,
      name: name || '新模板',
      description: description || '',
      imageUrl,
      config
    });

    res.json(template);
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: '创建模板失败' });
  }
});

// 更新模板（需要管理员）
app.put('/api/templates/:id', adminMiddleware, (req, res) => {
  try {
    const updated = templateDb.update(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: '模板不存在' });
    }
    res.json(updated);
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: '更新模板失败' });
  }
});

// 删除模板（需要管理员）
app.delete('/api/templates/:id', adminMiddleware, (req, res) => {
  try {
    const deleted = templateDb.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: '模板不存在' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: '删除模板失败' });
  }
});

// ========== AI 生成 API ==========

// 生成眼镜模特图（需要登录）
app.post('/api/generate/eyewear', authMiddleware, async (req, res) => {
  try {
    const { imageBase64, size, modelConfig } = req.body;

    if (!imageBase64 || !modelConfig) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const result = await generateEyewearImage(imageBase64, size || '1K', modelConfig);

    // 保存生成记录
    const imageId = crypto.randomUUID();
    imageDb.save({
      id: imageId,
      url: result,
      type: 'eyewear',
      config: modelConfig
    }, req.user.userId);

    res.json({ success: true, imageUrl: result });
  } catch (error) {
    console.error('Generate eyewear error:', error);
    res.status(500).json({ error: error.message || '生成失败' });
  }
});

// 生成海报（需要登录）
app.post('/api/generate/poster', authMiddleware, async (req, res) => {
  try {
    const { imageBase64, config, size, aspectRatio } = req.body;

    if (!imageBase64 || !config) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const result = await generatePosterImage(imageBase64, config, size || '1K', aspectRatio);

    // 保存生成记录
    const imageId = crypto.randomUUID();
    imageDb.save({
      id: imageId,
      url: result,
      type: 'poster',
      config: config
    }, req.user.userId);

    res.json({ success: true, imageUrl: result });
  } catch (error) {
    console.error('Generate poster error:', error);
    res.status(500).json({ error: error.message || '生成失败' });
  }
});

// 获取提示建议
app.post('/api/generate/suggestions', async (req, res) => {
  try {
    const { mode, imageBase64 } = req.body;
    const suggestions = await getPromptSuggestions(mode, imageBase64);
    res.json({ success: true, suggestions });
  } catch (error) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ error: '获取建议失败' });
  }
});

// ========== 用户数据 API ==========

// 获取用户生成历史
app.get('/api/user/history', authMiddleware, (req, res) => {
  try {
    const images = imageDb.getByUserId(req.user.userId);
    res.json({ success: true, images });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

// ========== 健康检查 ==========
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.GEMINI_API_KEY
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Lyra Server running on http://localhost:${PORT}`);
  console.log(`API Key configured: ${!!process.env.GEMINI_API_KEY}`);
});
