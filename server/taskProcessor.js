import crypto from 'crypto';
import { taskDb, imageDb, promptHistoryDb } from './db.js';
import { generateFromTemplate } from './gemini.js';

// 任务处理器配置
const POLL_INTERVAL = 3000; // 轮询间隔（毫秒）
const MAX_CONCURRENT = 2;   // 最大并发数
let isRunning = false;
let activeCount = 0;

// 处理单个任务
const processTask = async (task) => {
  console.log(`[TaskProcessor] Processing task ${task.id} (${task.type})`);

  try {
    taskDb.startProcessing(task.id);

    if (task.type === 'generate') {
      // 图片生成任务
      const { imageBase64, prompt, aspectRatio, templateId, templateName, variableValues, modelConfig, imageQuality } = task.inputData;

      taskDb.updateProgress(task.id, 30);

      // 调用生成函数
      let imageUrl;
      if (templateId === 'custom' && modelConfig) {
        // 自定义配置生成
        // 需要导入 generateEyewearImage
        const { generateEyewearImage } = await import('./gemini.js');
        imageUrl = await generateEyewearImage(imageBase64, modelConfig, imageQuality || '1K');
      } else {
        // 模板生成
        imageUrl = await generateFromTemplate(imageBase64, prompt, aspectRatio || '3:4');
      }

      taskDb.updateProgress(task.id, 80);

      // 保存到 generated_images
      const imageId = crypto.randomUUID();
      imageDb.save({
        id: imageId,
        url: imageUrl,
        type: 'template',
        config: { templateId, templateName, variableValues, modelConfig, async: true },
        prompt: prompt || (modelConfig ? JSON.stringify(modelConfig) : 'Custom Generation')
      }, task.userId);

      // 保存提示词历史
      if (task.userId) {
        promptHistoryDb.save(task.userId, prompt || 'Custom Config', templateId, variableValues || {}, true);
      }

      // 完成任务
      taskDb.complete(task.id, { imageId, imageUrl });
      console.log(`[TaskProcessor] Task ${task.id} completed successfully`);

    } else if (task.type === 'batch') {
      // 批量生成任务
      const { imageBase64, basePrompt, combinations, aspectRatio, templateId, templateName } = task.inputData;
      const results = [];
      const total = combinations.length;

      for (let i = 0; i < total; i++) {
        const combo = combinations[i];
        const progress = Math.round(20 + (i / total) * 70);
        taskDb.updateProgress(task.id, progress);

        try {
          // 替换变量
          let prompt = basePrompt;
          for (const [key, value] of Object.entries(combo)) {
            prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
          }

          // 生成图片
          const imageUrl = await generateFromTemplate(imageBase64, prompt, aspectRatio || '3:4');

          // 保存到 generated_images
          const imageId = crypto.randomUUID();
          imageDb.save({
            id: imageId,
            url: imageUrl,
            type: 'batch',
            config: { templateId, templateName, combination: combo, batchIndex: i },
            prompt
          }, task.userId);

          results.push({ imageId, imageUrl, combination: combo, success: true });

          // 保存提示词历史
          if (task.userId) {
            promptHistoryDb.save(task.userId, prompt, templateId, combo, true);
          }
        } catch (err) {
          results.push({ combination: combo, success: false, error: err.message });
        }
      }

      // 完成任务
      taskDb.complete(task.id, {
        results,
        successCount: results.filter(r => r.success).length,
        failCount: results.filter(r => !r.success).length
      });
      console.log(`[TaskProcessor] Batch task ${task.id} completed: ${results.filter(r => r.success).length}/${total}`);

    } else {
      throw new Error(`Unknown task type: ${task.type}`);
    }

  } catch (error) {
    console.error(`[TaskProcessor] Task ${task.id} failed:`, error.message);
    taskDb.fail(task.id, error.message);
  }
};

// 主循环
const runLoop = async () => {
  if (!isRunning) return;

  try {
    // 重置卡住的任务
    const resetCount = taskDb.resetStuckTasks();
    if (resetCount > 0) {
      console.log(`[TaskProcessor] Reset ${resetCount} stuck tasks`);
    }

    // 获取可处理的任务数量
    const availableSlots = MAX_CONCURRENT - activeCount;
    if (availableSlots <= 0) {
      // 等待下一轮
      setTimeout(runLoop, POLL_INTERVAL);
      return;
    }

    // 获取待处理任务
    const pendingTasks = taskDb.getPending(availableSlots);

    if (pendingTasks.length > 0) {
      console.log(`[TaskProcessor] Found ${pendingTasks.length} pending tasks`);

      // 并行处理任务
      for (const task of pendingTasks) {
        activeCount++;
        processTask(task).finally(() => {
          activeCount--;
        });
      }
    }

  } catch (error) {
    console.error('[TaskProcessor] Loop error:', error);
  }

  // 继续下一轮
  setTimeout(runLoop, POLL_INTERVAL);
};

// 启动处理器
export const startTaskProcessor = () => {
  if (isRunning) {
    console.log('[TaskProcessor] Already running');
    return;
  }

  isRunning = true;
  console.log('[TaskProcessor] Started');

  // 启动定期清理
  setInterval(() => {
    const cleaned = taskDb.cleanup(7);
    if (cleaned > 0) {
      console.log(`[TaskProcessor] Cleaned ${cleaned} old tasks`);
    }
  }, 24 * 60 * 60 * 1000); // 每天清理一次

  // 开始主循环
  runLoop();
};

// 停止处理器
export const stopTaskProcessor = () => {
  isRunning = false;
  console.log('[TaskProcessor] Stopped');
};

// 获取处理器状态
export const getProcessorStatus = () => ({
  isRunning,
  activeCount,
  maxConcurrent: MAX_CONCURRENT,
  queueStats: taskDb.getQueueStats()
});
