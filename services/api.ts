import { ModelConfig, PosterConfig, TemplateItem, ImageSize, AspectRatio, AppMode, User, GeneratedImage, Tag, PromptHistoryItem, FavoriteTemplate, ProductShotConfig, ProductAngle, ProductShotResult, ProductShotBatchResponse, ProductShotBatchStatus } from '../types';

// 支持环境变量配置 API 地址
// 开发环境：使用 vite proxy 代理到本地服务器
// 生产环境：使用 Cloudflare Workers URL
// 简化逻辑：直接判断是否为开发环境
const isDev = import.meta.env.DEV;
const API_DOMAIN = isDev ? (import.meta.env.VITE_API_URL || 'http://localhost:8787') : 'https://api.glass.lyrai.eu';
const API_BASE = API_DOMAIN + '/api';

console.log('[Lyra Config] API Target:', API_BASE);


export const resolveImageUrl = (path: string | undefined | null): string => {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  if (path.startsWith('/r2/')) return API_DOMAIN + path;
  return path;
};

// Token 管理
const getToken = (): string | null => localStorage.getItem('lyra_auth_token');
const setToken = (token: string) => localStorage.setItem('lyra_auth_token', token);
const removeToken = () => localStorage.removeItem('lyra_auth_token');

// 通用请求函数
const request = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }

  return data;
};

// ========== 认证 API ==========

interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
  expiresAt: number;
}

export const authApi = {
  register: async (username: string, password: string): Promise<{ token: string; user: User; expiresAt: number }> => {
    const result = await request<AuthResponse>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }
    );
    setToken(result.token);
    return result;
  },

  login: async (username: string, password: string): Promise<{ token: string; user: User; expiresAt: number }> => {
    const result = await request<AuthResponse>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }
    );
    setToken(result.token);
    return result;
  },

  logout: async (): Promise<void> => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      removeToken();
    }
  },

  verify: async (): Promise<User | null> => {
    try {
      const result = await request<{ success: boolean; user: User }>('/auth/verify');
      return result.user;
    } catch {
      removeToken();
      return null;
    }
  },

  isLoggedIn: (): boolean => !!getToken(),

  getToken,

  changePassword: async (oldPassword: string, newPassword: string): Promise<void> => {
    await request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  },
};

// ========== 标签 API ==========

export const tagApi = {
  getAll: async (): Promise<Tag[]> => {
    return request<Tag[]>('/tags');
  },

  create: async (name: string, color?: string): Promise<Tag> => {
    return request<Tag>('/tags', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    });
  },

  update: async (id: string, name: string, color?: string): Promise<Tag> => {
    return request<Tag>(`/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, color }),
    });
  },

  delete: async (id: string): Promise<void> => {
    await request(`/tags/${id}`, { method: 'DELETE' });
  },
};

// ========== 模板 API ==========

export const templateApi = {
  getAll: async (options?: { tag?: string; page?: number; limit?: number }): Promise<{ data: TemplateItem[]; total: number; page: number; limit: number }> => {
    const params = new URLSearchParams();
    if (options?.tag) params.append('tag', options.tag);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<{ data: TemplateItem[]; total: number; page: number; limit: number }>(`/templates${query}`);
  },

  getById: async (id: string): Promise<TemplateItem> => {
    return request<TemplateItem>(`/templates/${id}`);
  },

  create: async (template: TemplateItem): Promise<TemplateItem> => {
    return request<TemplateItem>('/templates', {
      method: 'POST',
      body: JSON.stringify(template),
    });
  },

  update: async (id: string, updates: Partial<TemplateItem>): Promise<TemplateItem> => {
    return request<TemplateItem>(`/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<void> => {
    await request(`/templates/${id}`, { method: 'DELETE' });
  },
};

// ========== AI 生成 API ==========

export const generateApi = {
  eyewear: async (
    imageBase64: string,
    size: ImageSize,
    modelConfig: ModelConfig
  ): Promise<string> => {
    const result = await request<{ success: boolean; imageUrl: string }>(
      '/generate/eyewear',
      {
        method: 'POST',
        body: JSON.stringify({ imageBase64, size, modelConfig }),
      }
    );
    return result.imageUrl;
  },

  poster: async (
    imageBase64: string,
    config: PosterConfig,
    size: ImageSize,
    aspectRatio?: AspectRatio
  ): Promise<string> => {
    const result = await request<{ success: boolean; imageUrl: string }>(
      '/generate/poster',
      {
        method: 'POST',
        body: JSON.stringify({ imageBase64, config, size, aspectRatio }),
      }
    );
    return result.imageUrl;
  },

  // 使用模板生成
  fromTemplate: async (
    imageBase64: string,
    templateId: string,
    variableValues?: Record<string, string>,
    aspectRatio?: AspectRatio
  ): Promise<string> => {
    const result = await request<{ success: boolean; imageUrl: string }>(
      '/generate/template',
      {
        method: 'POST',
        body: JSON.stringify({ imageBase64, templateId, variableValues, aspectRatio }),
      }
    );
    return result.imageUrl;
  },

  suggestions: async (mode: AppMode, imageBase64?: string): Promise<string[]> => {
    const result = await request<{ success: boolean; suggestions: string[] }>(
      '/generate/suggestions',
      {
        method: 'POST',
        body: JSON.stringify({ mode, imageBase64 }),
      }
    );
    return result.suggestions;
  },

  // AI 优化提示词
  optimizePrompt: async (prompt: string): Promise<{
    name: string;
    description: string;
    defaultGender: string;
    defaultFraming: string;
    female: string;
    male: string | null;
  }> => {
    const result = await request<{ success: boolean; optimizedPrompt: any }>(
      '/generate/optimize-prompt',
      {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      }
    );
    return result.optimizedPrompt;
  },
};

// ========== 用户数据 API ==========

export const userApi = {
  getHistory: async (view?: 'all' | 'mine'): Promise<GeneratedImage[]> => {
    const query = view ? `?view=${view}` : '';
    const result = await request<{ success: boolean; images: GeneratedImage[] }>(`/user/history${query}`);
    return result.images;
  },

  deleteImage: async (imageId: string): Promise<boolean> => {
    const result = await request<{ success: boolean }>(`/user/history/${imageId}`, {
      method: 'DELETE',
    });
    return result.success;
  },

  // 获取社区公开作品
  getPublicGallery: async (): Promise<GeneratedImage[]> => {
    const result = await request<{ success: boolean; images: GeneratedImage[] }>('/gallery/public');
    return result.images;
  },

  // 分享/取消分享作品
  shareImage: async (imageId: string, isPublic: boolean): Promise<{ success: boolean; message: string }> => {
    return request(`/user/history/${imageId}/share`, {
      method: 'POST',
      body: JSON.stringify({ isPublic }),
    });
  },

  // 收藏相关
  getFavorites: async (): Promise<FavoriteTemplate[]> => {
    const result = await request<{ success: boolean; favorites: FavoriteTemplate[] }>('/user/favorites');
    return result.favorites;
  },

  addFavorite: async (templateId: string): Promise<boolean> => {
    const result = await request<{ success: boolean; added: boolean }>(`/user/favorites/${templateId}`, {
      method: 'POST',
    });
    return result.added;
  },

  removeFavorite: async (templateId: string): Promise<boolean> => {
    const result = await request<{ success: boolean; removed: boolean }>(`/user/favorites/${templateId}`, {
      method: 'DELETE',
    });
    return result.removed;
  },

  checkFavorite: async (templateId: string): Promise<boolean> => {
    const result = await request<{ success: boolean; isFavorited: boolean }>(`/user/favorites/${templateId}/check`);
    return result.isFavorited;
  },

  // 提示词历史
  getPromptHistory: async (successfulOnly?: boolean): Promise<PromptHistoryItem[]> => {
    const query = successfulOnly ? '?successful=true' : '';
    const result = await request<{ success: boolean; history: PromptHistoryItem[] }>(`/user/prompt-history${query}`);
    return result.history;
  },

  deletePromptHistory: async (id: number): Promise<boolean> => {
    const result = await request<{ success: boolean; deleted: boolean }>(`/user/prompt-history/${id}`, {
      method: 'DELETE',
    });
    return result.deleted;
  },
};

// ========== 反馈 API ==========

export const feedbackApi = {
  submit: async (imageId: string, rating: 1 | -1): Promise<void> => {
    await request(`/feedback/${imageId}`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
  },

  getStats: async (imageId: string): Promise<{ likes: number; dislikes: number }> => {
    const result = await request<{ success: boolean; likes: number; dislikes: number }>(`/feedback/${imageId}`);
    return { likes: result.likes, dislikes: result.dislikes };
  },

  getUserRating: async (imageId: string): Promise<number> => {
    const result = await request<{ success: boolean; rating: number }>(`/feedback/${imageId}/user`);
    return result.rating;
  },

  getTemplateStats: async (templateId: string): Promise<{
    likes: number;
    dislikes: number;
    total: number;
    satisfaction: number | null;
    favoriteCount: number;
  }> => {
    return request(`/templates/${templateId}/stats`);
  },
};

// ========== 批量生成 API ==========

interface BatchCombination {
  ethnicity: string;
  age: string;
  expression?: string;
  pose?: string;
  [key: string]: string | undefined;
}

interface BatchResult {
  imageId: string;
  imageUrl: string;
  combination: BatchCombination;
}

interface BatchGenerateResponse {
  success: boolean;
  results: BatchResult[];
  failed: Array<{ index: number; error: string }>;
  total: number;
  successCount: number;
}

export const batchApi = {
  generate: async (
    imageBase64: string,
    templateId: string | null,
    combinations: BatchCombination[],
    aspectRatio?: AspectRatio,
    basePrompt?: string
  ): Promise<BatchGenerateResponse> => {
    return request<BatchGenerateResponse>('/generate/batch', {
      method: 'POST',
      body: JSON.stringify({
        imageBase64,
        templateId: templateId || 'custom',
        combinations,
        aspectRatio,
        basePrompt,
      }),
    });
  },
};

// ========== 异步任务 API ==========

interface TaskResponse {
  success: boolean;
  taskId: string;
  status: string;
  queuePosition: number;
  message: string;
  totalImages?: number;
}

interface Task {
  id: string;
  type: 'generate' | 'batch' | 'product_shot';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  inputData?: any;
  outputData?: any;
  errorMessage?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export const taskApi = {
  // 提交异步生成任务
  submitGenerate: async (
    imageBase64: string,
    prompt: string,
    aspectRatio?: string,
    templateId?: string,
    templateName?: string,
    variableValues?: Record<string, string>,
    modelConfig?: any,
    imageQuality?: string
  ): Promise<TaskResponse> => {
    return request<TaskResponse>('/tasks/generate', {
      method: 'POST',
      body: JSON.stringify({
        imageBase64,
        prompt,
        aspectRatio,
        templateId,
        templateName,
        variableValues,
        modelConfig,
        imageQuality
      })
    });
  },

  // 提交异步批量任务
  submitBatch: async (
    imageBase64: string,
    basePrompt: string,
    combinations: Array<Record<string, string>>,
    aspectRatio?: string,
    templateId?: string,
    templateName?: string,
    concurrency: number = 3
  ): Promise<TaskResponse> => {
    return request<TaskResponse>('/tasks/batch', {
      method: 'POST',
      body: JSON.stringify({
        imageBase64,
        basePrompt,
        combinations,
        aspectRatio,
        templateId,
        templateName,
        concurrency
      })
    });
  },

  // 获取任务状态
  getTask: async (taskId: string): Promise<{ success: boolean; task: Task }> => {
    return request(`/tasks/${taskId}`);
  },

  // 获取用户任务列表
  getTasks: async (activeOnly?: boolean): Promise<{ success: boolean; tasks: Task[] }> => {
    const query = activeOnly ? '?active=true' : '';
    return request(`/tasks${query}`);
  },

  // 获取已完成任务
  getCompletedTasks: async (): Promise<{ success: boolean; tasks: Task[] }> => {
    return request('/tasks?completed=true');
  },

  // 取消任务
  cancelTask: async (taskId: string): Promise<boolean> => {
    const result = await request<{ success: boolean }>(`/tasks/${taskId}/cancel`, {
      method: 'POST'
    });
    return result.success;
  },

  // 获取队列统计
  getQueueStats: async (): Promise<{
    success: boolean;
    queue: QueueStats;
    processor: { isRunning: boolean; activeWorkers: number; maxWorkers: number };
  }> => {
    return request('/tasks/queue/stats');
  },

  // 提交产品图生成任务
  submitProductShot: async (
    imageBase64: string,
    angles: ProductAngle[],
    config: Omit<ProductShotConfig, 'angles'>,
    concurrency: number = 3
  ): Promise<ProductShotBatchResponse> => {
    return request<ProductShotBatchResponse>('/tasks/product-shot', {
      method: 'POST',
      body: JSON.stringify({
        imageBase64,
        angles,
        config,
        concurrency
      })
    });
  },

  // 取消任务 - Duplicate removed


  // 获取批次状态
  getBatchStatus: async (batchId: string): Promise<ProductShotBatchStatus> => {
    return request<ProductShotBatchStatus>(`/tasks/batch/${batchId}`);
  }
};

// ========== 健康检查 ==========

export const healthCheck = async (): Promise<{ status: string; hasApiKey: boolean }> => {
  return request('/health');
};
