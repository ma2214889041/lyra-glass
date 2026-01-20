import { ModelConfig, PosterConfig, TemplateItem, ImageSize, AspectRatio, AppMode } from '../types';

const API_BASE = '/api';

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

export const authApi = {
  login: async (username: string, password: string): Promise<{ token: string; expiresAt: number }> => {
    const result = await request<{ success: boolean; token: string; expiresAt: number }>(
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

  verify: async (): Promise<boolean> => {
    try {
      await request('/auth/verify');
      return true;
    } catch {
      removeToken();
      return false;
    }
  },

  isLoggedIn: (): boolean => !!getToken(),
};

// ========== 模板 API ==========

export const templateApi = {
  getAll: async (): Promise<TemplateItem[]> => {
    return request<TemplateItem[]>('/templates');
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
};

// ========== 健康检查 ==========

export const healthCheck = async (): Promise<{ status: string; hasApiKey: boolean }> => {
  return request('/health');
};
