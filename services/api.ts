import { ModelConfig, PosterConfig, TemplateItem, ImageSize, AspectRatio, AppMode, User, GeneratedImage, Tag } from '../types';

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
  getAll: async (tag?: string): Promise<TemplateItem[]> => {
    const query = tag ? `?tag=${tag}` : '';
    return request<TemplateItem[]>(`/templates${query}`);
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
};

// ========== 用户数据 API ==========

export const userApi = {
  getHistory: async (): Promise<GeneratedImage[]> => {
    const result = await request<{ success: boolean; images: GeneratedImage[] }>('/user/history');
    return result.images;
  },
};

// ========== 健康检查 ==========

export const healthCheck = async (): Promise<{ status: string; hasApiKey: boolean }> => {
  return request('/health');
};
