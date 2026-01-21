import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, Session } from './types';
import {
  tagDb, templateDb, userDb, sessionDb, imageDb, assetDb,
  favoriteDb, promptHistoryDb, feedbackDb, taskDb
} from './db';
import {
  register, login, logout, changePassword, validateSession, extractToken
} from './auth';
import { saveImage, deleteImage, saveAsset, deleteAsset, getImage, cleanupOldImages } from './storage';
import {
  generateEyewearImage, generatePosterImage, getPromptSuggestions,
  generateFromTemplate, optimizePrompt
} from './gemini';

// 扩展 Hono Context
type Variables = {
  user: Session;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// CORS 中间件
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// 认证中间件
const authMiddleware = async (c: any, next: () => Promise<void>) => {
  const token = extractToken(c.req.header('Authorization'));
  if (!token) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const session = await validateSession(c.env.DB, token);
  if (!session) {
    return c.json({ error: 'Session 已过期，请重新登录' }, 401);
  }

  c.set('user', session);
  await next();
};

// 管理员中间件
const adminMiddleware = async (c: any, next: () => Promise<void>) => {
  const token = extractToken(c.req.header('Authorization'));
  if (!token) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const session = await validateSession(c.env.DB, token);
  if (!session) {
    return c.json({ error: 'Session 已过期，请重新登录' }, 401);
  }

  if (session.role !== 'admin') {
    return c.json({ error: '需要管理员权限' }, 403);
  }

  c.set('user', session);
  await next();
};

// ========== R2 静态文件服务 ==========
app.get('/r2/*', async (c) => {
  const key = c.req.path.slice(4); // 去掉 /r2/ 前缀
  const object = await getImage(c.env.R2, key);

  if (!object) {
    return c.json({ error: 'File not found' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, { headers });
});

// ========== 认证 API ==========
app.post('/api/auth/register', async (c) => {
  try {
    const { username, password } = await c.req.json();

    if (!username || !password) {
      return c.json({ error: '请提供用户名和密码' }, 400);
    }

    const result = await register(c.env.DB, username, password);
    if ('error' in result) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({
      success: true,
      token: result.token,
      user: result.user,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    console.error('Register error:', error);
    return c.json({ error: '注册失败，请稍后重试' }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  try {
    const { username, password } = await c.req.json();

    if (!username || !password) {
      return c.json({ error: '请提供用户名和密码' }, 400);
    }

    const result = await login(
      c.env.DB,
      username,
      password,
      c.env.ADMIN_USERNAME,
      c.env.ADMIN_PASSWORD
    );

    if (!result) {
      return c.json({ error: '用户名或密码错误' }, 401);
    }

    return c.json({
      success: true,
      token: result.token,
      user: result.user,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: '登录失败，请稍后重试' }, 500);
  }
});

app.post('/api/auth/logout', authMiddleware, async (c) => {
  const token = extractToken(c.req.header('Authorization'))!;
  await logout(c.env.DB, token);
  return c.json({ success: true });
});

app.get('/api/auth/verify', authMiddleware, async (c) => {
  const user = c.get('user');
  return c.json({
    success: true,
    user: {
      id: user.userId,
      username: user.username,
      role: user.role
    }
  });
});

app.post('/api/auth/change-password', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { oldPassword, newPassword } = await c.req.json();

    if (!oldPassword || !newPassword) {
      return c.json({ error: '请提供当前密码和新密码' }, 400);
    }

    if (user.role === 'admin' && !user.userId) {
      return c.json({ error: '管理员账户请通过环境变量修改密码' }, 400);
    }

    const result = await changePassword(c.env.DB, user.userId!, oldPassword, newPassword);
    if ('error' in result) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('Change password error:', error);
    return c.json({ error: '密码修改失败，请稍后重试' }, 500);
  }
});

// ========== 标签 API ==========
app.get('/api/tags', async (c) => {
  try {
    const tags = await tagDb.getAll(c.env.DB);
    return c.json(tags);
  } catch (error) {
    console.error('Get tags error:', error);
    return c.json({ error: '获取标签失败' }, 500);
  }
});

app.post('/api/tags', adminMiddleware, async (c) => {
  try {
    let tagData = await c.req.json();

    // 兼容前端格式
    if (tagData.name && typeof tagData.name === 'object') {
      tagData = tagData.name;
    }

    const { name, color, id } = tagData;
    if (!name) {
      return c.json({ error: '标签名称不能为空' }, 400);
    }

    const tag = await tagDb.create(c.env.DB, { id, name, color });
    return c.json(tag);
  } catch (error) {
    console.error('Create tag error:', error);
    return c.json({ error: '创建标签失败' }, 500);
  }
});

app.put('/api/tags/:id', adminMiddleware, async (c) => {
  try {
    const { name, color } = await c.req.json();
    if (!name) {
      return c.json({ error: '标签名称不能为空' }, 400);
    }

    const tag = await tagDb.update(c.env.DB, c.req.param('id'), { name, color });
    if (!tag) {
      return c.json({ error: '标签不存在' }, 404);
    }
    return c.json(tag);
  } catch (error) {
    console.error('Update tag error:', error);
    return c.json({ error: '更新标签失败' }, 500);
  }
});

app.delete('/api/tags/:id', adminMiddleware, async (c) => {
  try {
    const deleted = await tagDb.delete(c.env.DB, c.req.param('id'));
    if (!deleted) {
      return c.json({ error: '标签不存在' }, 404);
    }
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete tag error:', error);
    return c.json({ error: '删除标签失败' }, 500);
  }
});

// ========== 模板 API ==========
app.get('/api/templates', async (c) => {
  try {
    const tag = c.req.query('tag');
    const templates = await templateDb.getAll(c.env.DB, tag || undefined);
    return c.json(templates);
  } catch (error) {
    console.error('Get templates error:', error);
    return c.json({ error: '获取模板失败' }, 500);
  }
});

app.get('/api/templates/:id', async (c) => {
  try {
    const template = await templateDb.getById(c.env.DB, c.req.param('id'));
    if (!template) {
      return c.json({ error: '模板不存在' }, 404);
    }
    return c.json(template);
  } catch (error) {
    console.error('Get template error:', error);
    return c.json({ error: '获取模板失败' }, 500);
  }
});

app.post('/api/templates', adminMiddleware, async (c) => {
  try {
    let { id, name, description, imageUrl, prompt, malePrompt, femalePrompt, defaultGender, tags, variables } = await c.req.json();

    if (!imageUrl && !prompt) {
      return c.json({ error: '至少需要提供 imageUrl 或 prompt' }, 400);
    }

    // 如果是 base64 图片，保存到 R2
    if (imageUrl && (imageUrl.startsWith('data:image/') || imageUrl.length > 1000)) {
      const assetName = name || 'template';
      const result = await saveAsset(c.env.R2, imageUrl, assetName);
      imageUrl = result.url;
    }

    const template = await templateDb.create(c.env.DB, {
      id: id || `tpl_${Date.now()}`,
      name: name || '新模板',
      description: description || '',
      imageUrl: imageUrl || '',
      prompt: prompt || '',
      malePrompt: malePrompt || null,
      femalePrompt: femalePrompt || null,
      defaultGender: defaultGender || 'female',
      tags: tags || [],
      variables: variables || []
    });

    return c.json(template);
  } catch (error) {
    console.error('Create template error:', error);
    return c.json({ error: '创建模板失败' }, 500);
  }
});

app.put('/api/templates/:id', adminMiddleware, async (c) => {
  try {
    const updates = await c.req.json();
    const updated = await templateDb.update(c.env.DB, c.req.param('id'), updates);
    if (!updated) {
      return c.json({ error: '模板不存在' }, 404);
    }
    return c.json(updated);
  } catch (error) {
    console.error('Update template error:', error);
    return c.json({ error: '更新模板失败' }, 500);
  }
});

app.delete('/api/templates/:id', adminMiddleware, async (c) => {
  try {
    const template = await templateDb.getById(c.env.DB, c.req.param('id'));
    if (!template) {
      return c.json({ error: '模板不存在' }, 404);
    }

    // 删除模板图片
    if (template.imageUrl) {
      await deleteAsset(c.env.R2, template.imageUrl);
    }

    const deleted = await templateDb.delete(c.env.DB, c.req.param('id'));
    if (!deleted) {
      return c.json({ error: '删除失败' }, 500);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete template error:', error);
    return c.json({ error: '删除模板失败' }, 500);
  }
});

// ========== AI 生成 API ==========
app.post('/api/generate/eyewear', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { imageBase64, size, modelConfig } = await c.req.json();

    if (!imageBase64 || !modelConfig) {
      return c.json({ error: '缺少必要参数' }, 400);
    }

    const result = await generateEyewearImage(c.env.GEMINI_API_KEY, imageBase64, size || '1K', modelConfig);

    // 保存图片到 R2
    const imageId = crypto.randomUUID();
    const { url, thumbnailUrl } = await saveImage(c.env.R2, result, user.userId || 0, imageId);

    // 保存记录
    await imageDb.save(c.env.DB, {
      id: imageId,
      url,
      thumbnailUrl,
      type: 'eyewear',
      config: modelConfig
    }, user.userId);

    return c.json({ success: true, imageUrl: url, thumbnailUrl });
  } catch (error: any) {
    console.error('Generate eyewear error:', error);
    return c.json({ error: error.message || '生成失败' }, 500);
  }
});

app.post('/api/generate/poster', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { imageBase64, config, size, aspectRatio } = await c.req.json();

    if (!imageBase64 || !config) {
      return c.json({ error: '缺少必要参数' }, 400);
    }

    const result = await generatePosterImage(c.env.GEMINI_API_KEY, imageBase64, config, size || '1K', aspectRatio);

    const imageId = crypto.randomUUID();
    const { url, thumbnailUrl } = await saveImage(c.env.R2, result, user.userId || 0, imageId);

    await imageDb.save(c.env.DB, {
      id: imageId,
      url,
      thumbnailUrl,
      type: 'poster',
      config
    }, user.userId);

    return c.json({ success: true, imageUrl: url, thumbnailUrl });
  } catch (error: any) {
    console.error('Generate poster error:', error);
    return c.json({ error: error.message || '生成失败' }, 500);
  }
});

app.post('/api/generate/template', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { imageBase64, templateId, aspectRatio, variableValues, customPrompt } = await c.req.json();

    if (!imageBase64) {
      return c.json({ error: '缺少必要参数(imageBase64)' }, 400);
    }

    let finalPrompt: string;
    let templateName = '自定义';

    if (customPrompt) {
      finalPrompt = customPrompt;
    } else if (templateId && templateId !== 'custom') {
      const template = await templateDb.getById(c.env.DB, templateId);
      if (!template) {
        return c.json({ error: '模板不存在' }, 404);
      }
      templateName = template.name;

      finalPrompt = template.prompt;
      if (variableValues && typeof variableValues === 'object') {
        for (const [key, value] of Object.entries(variableValues)) {
          finalPrompt = finalPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value as string);
        }
      }
    } else {
      return c.json({ error: '缺少必要参数(customPrompt 或 templateId)' }, 400);
    }

    const result = await generateFromTemplate(c.env.GEMINI_API_KEY, imageBase64, finalPrompt, aspectRatio || '3:4');

    const imageId = crypto.randomUUID();
    const { url, thumbnailUrl } = await saveImage(c.env.R2, result, user.userId || 0, imageId);

    await imageDb.save(c.env.DB, {
      id: imageId,
      url,
      thumbnailUrl,
      type: 'template',
      config: { templateId, templateName, variableValues, customPrompt: !!customPrompt },
      prompt: finalPrompt
    }, user.userId);

    await promptHistoryDb.save(c.env.DB, user.userId || 0, finalPrompt, templateId !== 'custom' ? templateId : null, variableValues || {}, true);

    return c.json({ success: true, imageUrl: url, thumbnailUrl, imageId });
  } catch (error: any) {
    console.error('Generate from template error:', error);
    return c.json({ error: error.message || '模板生成失败' }, 500);
  }
});

app.post('/api/generate/suggestions', async (c) => {
  try {
    const { mode, imageBase64 } = await c.req.json();
    const suggestions = await getPromptSuggestions(c.env.GEMINI_API_KEY, mode, imageBase64);
    return c.json({ success: true, suggestions });
  } catch (error) {
    console.error('Get suggestions error:', error);
    return c.json({ error: '获取建议失败' }, 500);
  }
});

app.post('/api/generate/optimize-prompt', adminMiddleware, async (c) => {
  try {
    const { prompt } = await c.req.json();
    if (!prompt || prompt.trim().length === 0) {
      return c.json({ error: '请输入需要优化的提示词' }, 400);
    }
    const optimized = await optimizePrompt(c.env.GEMINI_API_KEY, prompt);
    return c.json({ success: true, optimizedPrompt: optimized });
  } catch (error: any) {
    console.error('Optimize prompt error:', error);
    return c.json({ error: error.message || '优化提示词失败' }, 500);
  }
});

// ========== 用户数据 API ==========
app.get('/api/user/history', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const view = c.req.query('view');

    let images;
    if (view === 'all' && user.role === 'admin') {
      images = await imageDb.getByUserId(c.env.DB, null, 100);
    } else {
      images = await imageDb.getByUserId(c.env.DB, user.userId, 50);
    }

    return c.json({ success: true, images });
  } catch (error) {
    console.error('Get history error:', error);
    return c.json({ error: '获取历史记录失败' }, 500);
  }
});

app.delete('/api/user/history/:imageId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const image = await imageDb.getById(c.env.DB, c.req.param('imageId'));

    if (!image) {
      return c.json({ error: '图片不存在' }, 404);
    }

    if (image.userId !== user.userId && user.role !== 'admin') {
      return c.json({ error: '无权删除此图片' }, 403);
    }

    await deleteImage(c.env.R2, image.url);
    await imageDb.delete(c.env.DB, c.req.param('imageId'));

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete image error:', error);
    return c.json({ error: '删除图片失败' }, 500);
  }
});

// ========== 社区画廊 API ==========
app.get('/api/gallery/public', async (c) => {
  try {
    const images = await imageDb.getPublicImages(c.env.DB, 50);
    return c.json({ success: true, images });
  } catch (error) {
    console.error('Get public gallery error:', error);
    return c.json({ error: '获取社区作品失败' }, 500);
  }
});

app.post('/api/user/history/:imageId/share', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { isPublic } = await c.req.json();

    if (typeof isPublic !== 'boolean') {
      return c.json({ error: '参数错误' }, 400);
    }

    const result = await imageDb.setPublic(c.env.DB, c.req.param('imageId'), isPublic, user.userId!);

    if (!result.success) {
      return c.json({ error: result.error || '操作失败' }, 403);
    }

    return c.json({
      success: true,
      message: isPublic ? '作品已分享到社区' : '作品已设为私有'
    });
  } catch (error) {
    console.error('Share image error:', error);
    return c.json({ error: '操作失败' }, 500);
  }
});

// ========== 收藏 API ==========
app.get('/api/user/favorites', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const favorites = await favoriteDb.getByUserId(c.env.DB, user.userId!);
    return c.json({ success: true, favorites });
  } catch (error) {
    console.error('Get favorites error:', error);
    return c.json({ error: '获取收藏列表失败' }, 500);
  }
});

app.post('/api/user/favorites/:templateId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const added = await favoriteDb.add(c.env.DB, user.userId!, c.req.param('templateId'));
    return c.json({ success: true, added });
  } catch (error) {
    console.error('Add favorite error:', error);
    return c.json({ error: '添加收藏失败' }, 500);
  }
});

app.delete('/api/user/favorites/:templateId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const removed = await favoriteDb.remove(c.env.DB, user.userId!, c.req.param('templateId'));
    return c.json({ success: true, removed });
  } catch (error) {
    console.error('Remove favorite error:', error);
    return c.json({ error: '取消收藏失败' }, 500);
  }
});

app.get('/api/user/favorites/:templateId/check', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const isFavorited = await favoriteDb.isFavorited(c.env.DB, user.userId!, c.req.param('templateId'));
    return c.json({ success: true, isFavorited });
  } catch (error) {
    console.error('Check favorite error:', error);
    return c.json({ error: '检查收藏状态失败' }, 500);
  }
});

// ========== 提示词历史 API ==========
app.get('/api/user/prompt-history', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const successful = c.req.query('successful');
    const history = successful === 'true'
      ? await promptHistoryDb.getSuccessful(c.env.DB, user.userId!)
      : await promptHistoryDb.getByUserId(c.env.DB, user.userId!);
    return c.json({ success: true, history });
  } catch (error) {
    console.error('Get prompt history error:', error);
    return c.json({ error: '获取提示词历史失败' }, 500);
  }
});

app.delete('/api/user/prompt-history/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const deleted = await promptHistoryDb.delete(c.env.DB, parseInt(c.req.param('id')), user.userId!);
    return c.json({ success: true, deleted });
  } catch (error) {
    console.error('Delete prompt history error:', error);
    return c.json({ error: '删除提示词历史失败' }, 500);
  }
});

// ========== 反馈 API ==========
app.post('/api/feedback/:imageId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { rating } = await c.req.json();
    if (rating !== 1 && rating !== -1) {
      return c.json({ error: '无效的评分值' }, 400);
    }
    await feedbackDb.upsert(c.env.DB, user.userId!, c.req.param('imageId'), rating);
    return c.json({ success: true });
  } catch (error) {
    console.error('Submit feedback error:', error);
    return c.json({ error: '提交反馈失败' }, 500);
  }
});

app.get('/api/feedback/:imageId', async (c) => {
  try {
    const stats = await feedbackDb.getStats(c.env.DB, c.req.param('imageId'));
    return c.json({ success: true, ...stats });
  } catch (error) {
    console.error('Get feedback error:', error);
    return c.json({ error: '获取反馈统计失败' }, 500);
  }
});

app.get('/api/feedback/:imageId/user', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const rating = await feedbackDb.get(c.env.DB, user.userId!, c.req.param('imageId'));
    return c.json({ success: true, rating: rating || 0 });
  } catch (error) {
    console.error('Get user feedback error:', error);
    return c.json({ error: '获取用户反馈失败' }, 500);
  }
});

app.get('/api/templates/:id/stats', async (c) => {
  try {
    const stats = await feedbackDb.getTemplateStats(c.env.DB, c.req.param('id'));
    const favoriteCount = await favoriteDb.getCount(c.env.DB, c.req.param('id'));
    return c.json({ success: true, ...stats, favoriteCount });
  } catch (error) {
    console.error('Get template stats error:', error);
    return c.json({ error: '获取模板统计失败' }, 500);
  }
});

// ========== 任务队列 API ==========
app.post('/api/tasks/generate', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { imageBase64, prompt, aspectRatio, templateId, templateName, variableValues, modelConfig, imageQuality, gender } = await c.req.json();

    if (!imageBase64 || (!prompt && !modelConfig)) {
      return c.json({ error: '缺少必要参数' }, 400);
    }

    const userId = user.userId ?? 0;
    const taskId = crypto.randomUUID();
    const task = await taskDb.create(c.env.DB, taskId, userId, 'generate', {
      imageBase64,
      prompt,
      aspectRatio: aspectRatio || '3:4',
      templateId,
      templateName,
      variableValues,
      modelConfig,
      imageQuality,
      gender: gender || 'female'
    });

    const stats = await taskDb.getQueueStats(c.env.DB);

    return c.json({
      success: true,
      taskId: task.id,
      status: task.status,
      queuePosition: stats.pending,
      message: '任务已加入队列，可关闭页面，稍后在历史记录中查看结果'
    });
  } catch (error) {
    console.error('Create task error:', error);
    return c.json({ error: '创建任务失败' }, 500);
  }
});

app.get('/api/tasks/:taskId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const task = await taskDb.getById(c.env.DB, c.req.param('taskId'));

    if (!task) {
      return c.json({ error: '任务不存在' }, 404);
    }

    const userId = user.userId ?? 0;
    if (task.userId !== userId) {
      return c.json({ error: '无权访问此任务' }, 403);
    }

    return c.json({
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
    return c.json({ error: '获取任务状态失败' }, 500);
  }
});

app.get('/api/tasks', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const active = c.req.query('active');
    const userId = user.userId ?? 0;

    const tasks = active === 'true'
      ? await taskDb.getActiveTasks(c.env.DB, userId)
      : await taskDb.getByUserId(c.env.DB, userId, 50);

    return c.json({ success: true, tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    return c.json({ error: '获取任务列表失败' }, 500);
  }
});

app.get('/api/tasks/queue/stats', async (c) => {
  try {
    const stats = await taskDb.getQueueStats(c.env.DB);
    return c.json({
      success: true,
      queue: stats,
      processor: {
        isRunning: true,
        activeWorkers: stats.processing,
        maxWorkers: 3
      }
    });
  } catch (error) {
    console.error('Get queue stats error:', error);
    return c.json({ error: '获取队列统计失败' }, 500);
  }
});

// ========== 管理员资源 API ==========
app.post('/api/admin/assets', adminMiddleware, async (c) => {
  try {
    const { name, imageData, type } = await c.req.json();
    if (!name || !imageData) {
      return c.json({ error: 'Missing name or imageData' }, 400);
    }

    const result = await saveAsset(c.env.R2, imageData, name);

    const asset = await assetDb.add(c.env.DB, {
      id: result.id,
      name,
      url: result.url,
      thumbnailUrl: result.thumbnailUrl,
      type: type || 'image'
    });

    return c.json({ success: true, asset });
  } catch (error) {
    console.error('Upload asset error:', error);
    return c.json({ error: 'Upload failed' }, 500);
  }
});

app.post('/api/admin/migrate-legacy-images', adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const urls = body.urls;

    if (!urls || !Array.isArray(urls)) {
      return c.json({ error: 'Invalid urls array' }, 400);
    }

    const results = [];
    for (const url of urls) {
      if (!url) continue;
      try {
        console.log(`Migrating: ${url}`);
        const resp = await fetch(url);
        if (!resp.ok) {
          results.push({ url, success: false, error: `Fetch status ${resp.status}` });
          continue;
        }

        const contentType = resp.headers.get('content-type') || 'image/png';
        const buffer = await resp.arrayBuffer();

        // Key: assets/filename.png
        // url: https://...r2.dev/assets/foo.png
        let key = '';
        if (url.includes('/assets/')) {
          key = 'assets/' + url.split('/assets/')[1];
        } else {
          key = 'assets/' + url.split('/').pop();
        }

        // Remove query params if any
        key = key.split('?')[0];

        await c.env.R2.put(key, buffer, {
          httpMetadata: { contentType }
        });

        results.push({ url, key, success: true });
      } catch (err: any) {
        console.error(`Migration error for ${url}:`, err);
        results.push({ url, success: false, error: err.message });
      }
    }
    return c.json({ success: true, processed: results.length, results });
  } catch (e: any) {
    console.error('Migration API error:', e);
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/admin/assets', adminMiddleware, async (c) => {
  try {
    const assets = await assetDb.getAll(c.env.DB);
    return c.json({ success: true, assets });
  } catch (error) {
    console.error('Get assets error:', error);
    return c.json({ error: 'Failed to get assets' }, 500);
  }
});

app.delete('/api/admin/assets/:id', adminMiddleware, async (c) => {
  try {
    const asset = await assetDb.getById(c.env.DB, c.req.param('id'));
    if (!asset) {
      return c.json({ error: 'Asset not found' }, 404);
    }

    await deleteAsset(c.env.R2, asset.url as string);
    await assetDb.delete(c.env.DB, c.req.param('id'));
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete asset error:', error);
    return c.json({ error: 'Failed to delete asset' }, 500);
  }
});

// ========== 健康检查 ==========
app.get('/api/health', async (c) => {
  const stats = await taskDb.getQueueStats(c.env.DB);
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: !!c.env.GEMINI_API_KEY,
    taskProcessor: 'running',
    queueStats: stats
  });
});

// ========== Cron 触发器（定时清理） ==========
export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('[Cron] Running scheduled cleanup...');

    // 清理过期 session
    const cleanedSessions = await sessionDb.cleanup(env.DB);
    console.log(`[Cron] Cleaned ${cleanedSessions} expired sessions`);

    // 清理过期图片（30天）
    const cleanedImages = await cleanupOldImages(env.R2, env.DB, 30);
    console.log(`[Cron] Cleaned ${cleanedImages} expired images`);

    // 清理过期任务（7天）
    const cleanedTasks = await taskDb.cleanup(env.DB, 7);
    console.log(`[Cron] Cleaned ${cleanedTasks} expired tasks`);

    // 重置卡住的任务
    const resetTasks = await taskDb.resetStuckTasks(env.DB);
    if (resetTasks > 0) {
      console.log(`[Cron] Reset ${resetTasks} stuck tasks`);
    }
  }
};
