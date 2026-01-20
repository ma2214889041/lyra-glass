import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { templateDb, sessionDb, imageDb, tagDb, favoriteDb, promptHistoryDb, feedbackDb, taskDb } from './db.js';
import { login, logout, register, changePassword, authMiddleware, adminMiddleware } from './auth.js';
import { generateEyewearImage, generatePosterImage, getPromptSuggestions, generateFromTemplate, optimizePrompt } from './gemini.js';
import { startTaskProcessor, getProcessorStatus } from './taskProcessor.js';

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

// 修改密码
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请提供当前密码和新密码' });
    }

    // 管理员账户不支持修改密码（通过环境变量配置）
    if (req.user.role === 'admin' && !req.user.userId) {
      return res.status(400).json({ error: '管理员账户请通过环境变量修改密码' });
    }

    const result = await changePassword(req.user.userId, oldPassword, newPassword);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: '密码修改失败，请稍后重试' });
  }
});

// ========== 标签 API ==========

// 获取所有标签
app.get('/api/tags', (req, res) => {
  try {
    const tags = tagDb.getAll();
    res.json(tags);
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: '获取标签失败' });
  }
});

// 创建标签（需要管理员）
app.post('/api/tags', adminMiddleware, (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: '标签名称不能为空' });
    }
    const tag = tagDb.create({ name, color });
    res.json(tag);
  } catch (error) {
    console.error('Create tag error:', error);
    res.status(500).json({ error: '创建标签失败' });
  }
});

// 更新标签（需要管理员）
app.put('/api/tags/:id', adminMiddleware, (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: '标签名称不能为空' });
    }
    const tag = tagDb.update(req.params.id, { name, color });
    if (!tag) {
      return res.status(404).json({ error: '标签不存在' });
    }
    res.json(tag);
  } catch (error) {
    console.error('Update tag error:', error);
    res.status(500).json({ error: '更新标签失败' });
  }
});

// 删除标签（需要管理员）
app.delete('/api/tags/:id', adminMiddleware, (req, res) => {
  try {
    const deleted = tagDb.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: '标签不存在' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: '删除标签失败' });
  }
});

// ========== 模板 API ==========

// 获取所有模板（公开，支持按标签筛选）
app.get('/api/templates', (req, res) => {
  try {
    const { tag } = req.query;
    const templates = templateDb.getAll(tag || null);
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
    const { id, name, description, imageUrl, prompt, tags, variables } = req.body;

    if (!id || !imageUrl || !prompt) {
      return res.status(400).json({ error: '缺少必要字段(id, imageUrl, prompt)' });
    }

    const template = templateDb.create({
      id,
      name: name || '新模板',
      description: description || '',
      imageUrl,
      prompt,
      tags: tags || [],
      variables: variables || []
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

// 使用模板生成（需要登录）
app.post('/api/generate/template', authMiddleware, async (req, res) => {
  try {
    const { imageBase64, templateId, aspectRatio, variableValues, customPrompt } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: '缺少必要参数(imageBase64)' });
    }

    let finalPrompt;
    let templateName = '自定义';

    // 如果用户提供了自定义提示词，直接使用
    if (customPrompt) {
      finalPrompt = customPrompt;
    } else if (templateId && templateId !== 'custom') {
      // 获取模板提示词
      const template = templateDb.getById(templateId);
      if (!template) {
        return res.status(404).json({ error: '模板不存在' });
      }
      templateName = template.name;

      // 替换变量占位符
      finalPrompt = template.prompt;
      if (variableValues && typeof variableValues === 'object') {
        for (const [key, value] of Object.entries(variableValues)) {
          finalPrompt = finalPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }
      }
    } else {
      return res.status(400).json({ error: '缺少必要参数(customPrompt 或 templateId)' });
    }

    const result = await generateFromTemplate(imageBase64, finalPrompt, aspectRatio || '3:4');

    // 保存生成记录
    const imageId = crypto.randomUUID();
    imageDb.save({
      id: imageId,
      url: result,
      type: 'template',
      config: { templateId, templateName, variableValues, customPrompt: !!customPrompt },
      prompt: finalPrompt
    }, req.user.userId);

    // 保存提示词历史
    promptHistoryDb.save(req.user.userId, finalPrompt, templateId !== 'custom' ? templateId : null, variableValues || {}, true);

    res.json({ success: true, imageUrl: result, imageId });
  } catch (error) {
    console.error('Generate from template error:', error);
    res.status(500).json({ error: error.message || '模板生成失败' });
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

// 优化提示词（管理员专用）
app.post('/api/generate/optimize-prompt', adminMiddleware, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: '请输入需要优化的提示词' });
    }
    const optimized = await optimizePrompt(prompt);
    res.json({ success: true, optimizedPrompt: optimized });
  } catch (error) {
    console.error('Optimize prompt error:', error);
    res.status(500).json({ error: error.message || '优化提示词失败' });
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

// ========== 收藏 API ==========

// 获取用户收藏列表
app.get('/api/user/favorites', authMiddleware, (req, res) => {
  try {
    const favorites = favoriteDb.getByUserId(req.user.userId);
    res.json({ success: true, favorites });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: '获取收藏列表失败' });
  }
});

// 添加收藏
app.post('/api/user/favorites/:templateId', authMiddleware, (req, res) => {
  try {
    const added = favoriteDb.add(req.user.userId, req.params.templateId);
    res.json({ success: true, added });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ error: '添加收藏失败' });
  }
});

// 取消收藏
app.delete('/api/user/favorites/:templateId', authMiddleware, (req, res) => {
  try {
    const removed = favoriteDb.remove(req.user.userId, req.params.templateId);
    res.json({ success: true, removed });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ error: '取消收藏失败' });
  }
});

// 检查是否已收藏
app.get('/api/user/favorites/:templateId/check', authMiddleware, (req, res) => {
  try {
    const isFavorited = favoriteDb.isFavorited(req.user.userId, req.params.templateId);
    res.json({ success: true, isFavorited });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ error: '检查收藏状态失败' });
  }
});

// ========== 提示词历史 API ==========

// 获取用户提示词历史
app.get('/api/user/prompt-history', authMiddleware, (req, res) => {
  try {
    const { successful } = req.query;
    const history = successful === 'true'
      ? promptHistoryDb.getSuccessful(req.user.userId)
      : promptHistoryDb.getByUserId(req.user.userId);
    res.json({ success: true, history });
  } catch (error) {
    console.error('Get prompt history error:', error);
    res.status(500).json({ error: '获取提示词历史失败' });
  }
});

// 删除提示词历史
app.delete('/api/user/prompt-history/:id', authMiddleware, (req, res) => {
  try {
    const deleted = promptHistoryDb.delete(parseInt(req.params.id), req.user.userId);
    res.json({ success: true, deleted });
  } catch (error) {
    console.error('Delete prompt history error:', error);
    res.status(500).json({ error: '删除提示词历史失败' });
  }
});

// ========== 反馈 API ==========

// 提交反馈
app.post('/api/feedback/:imageId', authMiddleware, (req, res) => {
  try {
    const { rating } = req.body; // 1 = like, -1 = dislike
    if (rating !== 1 && rating !== -1) {
      return res.status(400).json({ error: '无效的评分值' });
    }
    feedbackDb.upsert(req.user.userId, req.params.imageId, rating);
    res.json({ success: true });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: '提交反馈失败' });
  }
});

// 获取图片反馈统计
app.get('/api/feedback/:imageId', (req, res) => {
  try {
    const stats = feedbackDb.getStats(req.params.imageId);
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: '获取反馈统计失败' });
  }
});

// 获取用户对某图片的反馈
app.get('/api/feedback/:imageId/user', authMiddleware, (req, res) => {
  try {
    const rating = feedbackDb.get(req.user.userId, req.params.imageId);
    res.json({ success: true, rating: rating || 0 });
  } catch (error) {
    console.error('Get user feedback error:', error);
    res.status(500).json({ error: '获取用户反馈失败' });
  }
});

// 获取模板的满意度统计（管理员）
app.get('/api/templates/:id/stats', (req, res) => {
  try {
    const stats = feedbackDb.getTemplateStats(req.params.id);
    const favoriteCount = favoriteDb.getCount(req.params.id);
    res.json({ success: true, ...stats, favoriteCount });
  } catch (error) {
    console.error('Get template stats error:', error);
    res.status(500).json({ error: '获取模板统计失败' });
  }
});

// ========== 批量生成 API ==========

// 批量生成（需要登录）
app.post('/api/generate/batch', authMiddleware, async (req, res) => {
  try {
    const { imageBase64, templateId, combinations, aspectRatio } = req.body;

    if (!imageBase64 || !combinations || !Array.isArray(combinations) || combinations.length === 0) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (combinations.length > 5) {
      return res.status(400).json({ error: '单次批量生成最多5张' });
    }

    // 获取模板
    let basePrompt = '';
    let templateName = '自定义';
    if (templateId && templateId !== 'custom') {
      const template = templateDb.getById(templateId);
      if (!template) {
        return res.status(404).json({ error: '模板不存在' });
      }
      basePrompt = template.prompt;
      templateName = template.name;
    } else if (req.body.basePrompt) {
      basePrompt = req.body.basePrompt;
    } else {
      return res.status(400).json({ error: '缺少模板ID或基础提示词' });
    }

    // 并行生成所有组合
    const results = await Promise.allSettled(
      combinations.map(async (combo, index) => {
        // 替换变量
        let prompt = basePrompt;
        for (const [key, value] of Object.entries(combo)) {
          prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }

        // 生成图片
        const imageUrl = await generateFromTemplate(imageBase64, prompt, aspectRatio || '3:4');

        // 保存生成记录
        const imageId = crypto.randomUUID();
        imageDb.save({
          id: imageId,
          url: imageUrl,
          type: 'batch',
          config: { templateId, templateName, combination: combo, batchIndex: index },
          prompt
        }, req.user.userId);

        // 保存提示词历史
        promptHistoryDb.save(req.user.userId, prompt, templateId, combo, true);

        return { imageId, imageUrl, combination: combo };
      })
    );

    // 整理结果
    const successful = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    const failed = results
      .filter(r => r.status === 'rejected')
      .map((r, i) => ({ index: i, error: r.reason?.message || '生成失败' }));

    res.json({
      success: true,
      results: successful,
      failed,
      total: combinations.length,
      successCount: successful.length
    });
  } catch (error) {
    console.error('Batch generate error:', error);
    res.status(500).json({ error: error.message || '批量生成失败' });
  }
});

// ========== 异步任务 API ==========

// 提交异步生成任务
app.post('/api/tasks/generate', authMiddleware, (req, res) => {
  try {
    const { imageBase64, prompt, aspectRatio, templateId, templateName, variableValues, modelConfig, imageQuality } = req.body;

    if (!imageBase64 || (!prompt && !modelConfig)) {
      return res.status(400).json({ error: '缺少必要参数 (prompt 或 modelConfig)' });
    }

    const taskId = crypto.randomUUID();
    const task = taskDb.create(taskId, req.user.userId, 'generate', {
      imageBase64,
      prompt, // 如果是 custom 生成，prompt 可能为空
      aspectRatio: aspectRatio || '3:4',
      templateId,
      templateName,
      variableValues,
      modelConfig,
      imageQuality
    });

    // 获取队列位置
    const stats = taskDb.getQueueStats();
    const queuePosition = stats.pending;

    res.json({
      success: true,
      taskId: task.id,
      status: 'pending',
      queuePosition,
      message: '任务已加入队列，可关闭页面，稍后在历史记录中查看结果'
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: '创建任务失败' });
  }
});

// 提交异步批量生成任务
app.post('/api/tasks/batch', authMiddleware, (req, res) => {
  try {
    const { imageBase64, templateId, basePrompt, combinations, aspectRatio, templateName } = req.body;

    if (!imageBase64 || !basePrompt || !combinations || combinations.length === 0) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (combinations.length > 10) {
      return res.status(400).json({ error: '单次批量最多10张' });
    }

    const taskId = crypto.randomUUID();
    const task = taskDb.create(taskId, req.user.userId, 'batch', {
      imageBase64,
      basePrompt,
      combinations,
      aspectRatio: aspectRatio || '3:4',
      templateId,
      templateName
    });

    const stats = taskDb.getQueueStats();

    res.json({
      success: true,
      taskId: task.id,
      status: 'pending',
      queuePosition: stats.pending,
      totalImages: combinations.length,
      message: `${combinations.length}张图片已加入队列`
    });
  } catch (error) {
    console.error('Create batch task error:', error);
    res.status(500).json({ error: '创建批量任务失败' });
  }
});

// 查询任务状态
app.get('/api/tasks/:taskId', authMiddleware, (req, res) => {
  try {
    const task = taskDb.getById(req.params.taskId);

    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    // 验证任务属于当前用户
    if (task.userId !== req.user.userId) {
      return res.status(403).json({ error: '无权访问此任务' });
    }

    res.json({
      success: true,
      task: {
        id: task.id,
        type: task.type,
        status: task.status,
        progress: task.progress,
        outputData: task.outputData,
        errorMessage: task.errorMessage,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt
      }
    });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: '获取任务状态失败' });
  }
});

// 获取用户的任务列表
app.get('/api/tasks', authMiddleware, (req, res) => {
  try {
    const { active } = req.query;

    let tasks;
    if (active === 'true') {
      tasks = taskDb.getActiveTasks(req.user.userId);
    } else {
      tasks = taskDb.getByUserId(req.user.userId, 50);
    }

    res.json({ success: true, tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

// 获取队列统计（公开）
app.get('/api/tasks/queue/stats', (req, res) => {
  try {
    const stats = taskDb.getQueueStats();
    const processorStatus = getProcessorStatus();

    res.json({
      success: true,
      queue: stats,
      processor: {
        isRunning: processorStatus.isRunning,
        activeWorkers: processorStatus.activeCount,
        maxWorkers: processorStatus.maxConcurrent
      }
    });
  } catch (error) {
    console.error('Get queue stats error:', error);
    res.status(500).json({ error: '获取队列统计失败' });
  }
});

// ========== 健康检查 ==========
app.get('/api/health', (req, res) => {
  const processorStatus = getProcessorStatus();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.GEMINI_API_KEY,
    taskProcessor: processorStatus.isRunning ? 'running' : 'stopped',
    queueStats: processorStatus.queueStats
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Lyra Server running on http://localhost:${PORT}`);
  console.log(`API Key configured: ${!!process.env.GEMINI_API_KEY}`);

  // 启动任务处理器
  startTaskProcessor();
});
