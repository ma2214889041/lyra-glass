
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  AppMode, NavTab, ImageSize, AspectRatio, PosterConfig,
  GeneratedImage, ModelConfig, EyewearType,
  EthnicityType, LightingType, FramingType, CommercialStyle, ModelVibe,
  CameraType, LensType, SkinTexture, MoodType, StylePreset, TemplateItem, User,
  Tag, TemplateVariable, PREDEFINED_MODEL_VARIABLES, EXTENDED_VARIABLES,
  PromptHistoryItem, FavoriteTemplate, UserSettings, ProductShotConfig, ProductAngle, ProductBackground
} from './types';
import { authApi, templateApi, generateApi, userApi, tagApi, feedbackApi, batchApi, taskApi } from './services/api';
import { Button } from './components/Button';
import { FeatureCard } from './components/FeatureCard';
import {
  IconCamera, IconUpload, IconModel, IconCreative, IconPoster,
  IconGallery, IconSettings, IconUser, IconLogout, IconEdit
} from './components/Icons';
import { AuthPage } from './components/AuthPage';

const convertBlobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const result = (reader.result as string).split(',')[1];
      resolve(result);
    };
    reader.readAsDataURL(blob);
  });
};

const API_BASE = 'https://api.glass.lyrai.eu';

const getImageUrl = (url?: string) => {
  if (!url) return '';

  if (url.startsWith('data:')) return url;

  // 强制替换开发环境/本地 URL (修复数据库中存留的 localhost 地址)
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    const pathIndex = url.indexOf('/r2/');
    if (pathIndex !== -1) {
      return `${API_BASE}${url.substring(pathIndex)}`;
    }
  }

  // 已经包含完整 API 地址的 URL
  if (url.startsWith(API_BASE)) return url;

  // 处理 /r2/ 开头的路径
  if (url.startsWith('/r2/')) {
    return `${API_BASE}${url}`;
  }

  // 处理 assets/ 或 generated/ 开头的路径 (不带 /r2/，常见于数据库旧数据)
  if (url.startsWith('assets/') || url.startsWith('generated/')) {
    return `${API_BASE}/r2/${url}`;
  }

  // 对于以 http 开头的其他 URL (外部图片)，直接返回
  if (url.startsWith('http')) return url;

  // 其他相对路径，尝试加上 API_BASE
  if (url.startsWith('/')) {
    return `${API_BASE}${url}`;
  }

  return url;
};

const DEFAULT_CONFIG: ModelConfig = {
  eyewearType: 'Auto-detect',
  visualPurpose: 'Brand Campaign',
  modelVibe: 'Calm & Intellectual',
  ethnicity: 'East Asian',
  gender: 'Female',
  age: 'Adult',
  scene: "Minimalist concrete studio, high-end photography.",
  framing: 'Close-up',
  camera: 'Hasselblad H6D',
  lens: '85mm f/1.4',
  skinTexture: 'Natural Commercial',
  lighting: 'Softbox Diffused',
  mood: 'Natural Soft',
  aspectRatio: '3:4'
};

// --- 重用 UI 组件 ---

const NavItem = ({ active, onClick, icon, label }: any) => (
  <div onClick={onClick} className={`flex items-center gap-5 px-6 py-5 rounded-2xl cursor-pointer transition-all duration-300 ${active ? 'bg-white text-black font-bold scale-[1.02] shadow-xl' : 'text-zinc-600 hover:text-white hover:bg-white/5'}`}>
    {icon} <span className="text-[10px] tracking-[0.2em] uppercase font-black">{label}</span>
  </div>
);

const SelectorGroup = ({ title, icon, color, children }: any) => (
  <div className="space-y-10 p-10 bg-zinc-900/10 rounded-[3rem] border border-white/[0.03] shadow-inner">
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-2xl ${color} bg-opacity-10 flex items-center justify-center border border-current/10`}>{icon}</div>
      <h3 className="text-[13px] font-black uppercase tracking-[0.2em] text-white/90">{title}</h3>
    </div>
    <div className="space-y-12">{children}</div>
  </div>
);

const Selector = ({ label, options, current, onChange, labelMap }: any) => (
  <div className="flex flex-col gap-5">
    <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-black">{label}</label>
    <div className="flex flex-wrap gap-3">
      {options?.map && options.map((opt: string) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-5 py-4 rounded-2xl text-[10px] font-bold border transition-all duration-500 ${current === opt ? 'bg-white text-black border-white shadow-xl scale-105' : 'bg-zinc-950/40 text-zinc-500 border-white/5 hover:border-white/20'}`}
        >
          {labelMap ? (labelMap[opt] || opt) : opt}
        </button>
      ))}
    </div>
  </div>
);

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [configDepth, setConfigDepth] = useState<'basic' | 'master'>('basic');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);

  // 模板系统数据 - 从后端获取
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_CONFIG);

  // 产品图配置
  const [productShotConfig, setProductShotConfig] = useState<ProductShotConfig>({
    angles: ['front'],
    backgroundColor: 'pure_white',
    reflectionEnabled: true,
    shadowStyle: 'soft',
    outputSize: '2K',
    aspectRatio: '3:4'
  });

  // 用户认证状态
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  // 管理员表单状态
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [newTemplateImage, setNewTemplateImage] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<'create' | 'templates' | 'tags'>('create');  // 管理员页面Tab

  // 标签管理状态
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  // 新模板表单状态
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [newTemplatePrompt, setNewTemplatePrompt] = useState('');
  const [newTemplateTags, setNewTemplateTags] = useState<string[]>([]);
  const [newTemplateVariables, setNewTemplateVariables] = useState<TemplateVariable[]>([]);
  const [femaleTemplateTags, setFemaleTemplateTags] = useState<string[]>([]);  // 女性版本标签
  const [maleTemplateTags, setMaleTemplateTags] = useState<string[]>([]);  // 男性版本标签
  const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(null);  // 正在编辑的模板

  // 模板编辑：性别
  const [templateDefaultGender, setTemplateDefaultGender] = useState<'male' | 'female'>('female');

  // AI优化后的男女版本prompt
  const [optimizedPrompts, setOptimizedPrompts] = useState<{ female: string | null; male: string | null }>({ female: null, male: null });
  const [showOptimizedPrompts, setShowOptimizedPrompts] = useState(false);

  // 标签数据
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [filterTag, setFilterTag] = useState<string | null>(null);  // 模板广场筛选

  // 模板生成状态
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [editablePrompt, setEditablePrompt] = useState('');  // 用户可编辑的提示词
  const [showTemplateDetail, setShowTemplateDetail] = useState(false);  // 显示模板详情弹窗
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('female');  // 用户选择的性别

  // 用户生成选项
  const [userModelGender, setUserModelGender] = useState('女性');
  const [userModelEthnicity, setUserModelEthnicity] = useState('东亚人');
  const [userModelAge, setUserModelAge] = useState('成年');
  const [userImageQuality, setUserImageQuality] = useState<'1K' | '2K' | '4K'>('1K');
  const [userAspectRatio, setUserAspectRatio] = useState<'1:1' | '3:4' | '4:3' | '9:16' | '16:9'>('3:4');
  const [promptCopied, setPromptCopied] = useState(false);

  // 扩展变量状态
  const [userExpression, setUserExpression] = useState('自然');
  const [userPose, setUserPose] = useState('正面');
  const [userHairStyle, setUserHairStyle] = useState('自然');
  const [userClothingStyle, setUserClothingStyle] = useState('中性色');

  // 高级模式
  const [isEditMode, setIsEditMode] = useState(false);  // 提示词编辑模式
  const [editedPrompt, setEditedPrompt] = useState('');  // 编辑后的提示词
  const [isBatchMode, setIsBatchMode] = useState(false);  // 批量生成模式
  const [batchCombinations, setBatchCombinations] = useState<Array<{
    ethnicity: string;
    age: string;
    selected: boolean;
  }>>([]);

  // 收藏状态
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoriteTemplates, setFavoriteTemplates] = useState<FavoriteTemplate[]>([]);

  // 提示词历史
  const [promptHistory, setPromptHistory] = useState<PromptHistoryItem[]>([]);
  const [showPromptHistory, setShowPromptHistory] = useState(false);

  // 生成结果反馈
  const [lastGeneratedImageId, setLastGeneratedImageId] = useState<string | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // 批量生成结果
  const [batchResults, setBatchResults] = useState<Array<{ imageId: string; imageUrl: string; combination: any }>>([]);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);

  // 异步任务队列状态
  interface TaskItem {
    id: string;
    type: 'generate' | 'batch';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    errorMessage?: string;
    createdAt: number;
    result?: {
      imageId: string;
      imageUrl: string;
      thumbnailUrl?: string;
    };
    outputData?: {
      imageId: string;
      imageUrl: string;
      thumbnailUrl?: string;
    };
  }
  const [userSettings, setUserSettings] = useState<UserSettings>({ maxConcurrency: 2 });
  const [activeTasks, setActiveTasks] = useState<TaskItem[]>([]);
  const [showTaskQueue, setShowTaskQueue] = useState(false);
  const [taskPollingEnabled, setTaskPollingEnabled] = useState(true);

  // 中英文映射（用于生成英文prompt）
  const ethnicityToEnglish: Record<string, string> = {
    '中国人': 'Chinese',
    '日本人': 'Japanese',
    '韩国人': 'Korean',
    '东亚人': 'East Asian',
    '东南亚人': 'Southeast Asian',
    '印度人': 'Indian',
    '南亚人': 'South Asian',
    '中东人': 'Middle Eastern',
    '白人': 'Caucasian',
    '黑人': 'African American',
    '拉丁裔': 'Hispanic/Latino',
    '亚欧混血': 'Eurasian mixed',
    '多元族裔': 'Mixed ethnicity',
    '欧裔': 'Caucasian',
    '非裔': 'African',
    '中东裔': 'Middle Eastern'
  };
  const ageToEnglish: Record<string, string> = {
    '小孩': 'child',
    '青少年': 'teenager',
    '青年': 'young adult',
    '成年': 'adult',
    '成熟': 'mature'
  };

  // 扩展变量的英文映射
  const expressionToEnglish: Record<string, string> = {
    '微笑': 'gentle smile',
    '自信': 'confident',
    '严肃': 'serious',
    '沉思': 'thoughtful',
    '自然': 'natural relaxed'
  };
  const poseToEnglish: Record<string, string> = {
    '正面': 'frontal view',
    '3/4侧面': '3/4 view',
    '侧面': 'profile view',
    '微仰头': 'slight upward tilt'
  };
  const hairStyleToEnglish: Record<string, string> = {
    '长发': 'long hair',
    '短发': 'short hair',
    '马尾': 'ponytail',
    '盘发': 'hair bun',
    '自然': 'natural hair'
  };
  const clothingStyleToEnglish: Record<string, string> = {
    '中性色': 'neutral tones clothing',
    '暖色系': 'warm colored clothing',
    '冷色系': 'cool colored clothing',
    '黑白': 'black and white clothing',
    '鲜艳色彩': 'vibrant colored clothing'
  };

  // 生成完整提示词（替换变量）
  const getFullPrompt = (template: TemplateItem, includeExtended = true) => {
    const ethnicity = ethnicityToEnglish[userModelEthnicity] || userModelEthnicity;
    const age = ageToEnglish[userModelAge] || userModelAge;

    // 根据选择的性别使用对应的 prompt
    let basePrompt = template.prompt;
    if (template.malePrompt || template.femalePrompt) {
      // 使用选中性别的 prompt，如果不存在则使用另一个
      if (selectedGender === 'male' && template.malePrompt) {
        basePrompt = template.malePrompt;
      } else if (selectedGender === 'female' && template.femalePrompt) {
        basePrompt = template.femalePrompt;
      } else if (template.femalePrompt) {
        basePrompt = template.femalePrompt;
      } else if (template.malePrompt) {
        basePrompt = template.malePrompt;
      }
    }

    // 只替换核心变量：族裔和年龄
    // 其他选项由模板预设决定，保持最佳效果
    const prompt = basePrompt
      .replace(/\{\{ethnicity\}\}/g, ethnicity)
      .replace(/\{\{age\}\}/g, age);

    return prompt;
  };

  // 处理图片下载（通过 Blob 强制触发下载，避免页面跳转）
  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('下载失败:', err);
      // 降级方案：直接打开链接
      window.open(url, '_blank');
    }
  };

  // 复制提示词
  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 加载收藏列表
  const loadFavorites = useCallback(async () => {
    if (!currentUser) return;
    try {
      const favs = await userApi.getFavorites();
      setFavoriteTemplates(favs);
      setFavorites(new Set(favs?.map && favs.map(f => f.id)));
    } catch (err) {
      console.error('加载收藏失败:', err);
    }
  }, [currentUser]);

  // 切换收藏状态
  const handleToggleFavorite = async (templateId: string) => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    try {
      if (favorites.has(templateId)) {
        await userApi.removeFavorite(templateId);
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(templateId);
          return newSet;
        });
      } else {
        await userApi.addFavorite(templateId);
        setFavorites(prev => new Set(prev).add(templateId));
      }
    } catch (err) {
      console.error('收藏操作失败:', err);
    }
  };

  // 加载提示词历史
  const loadPromptHistory = useCallback(async () => {
    if (!currentUser) return;
    try {
      const history = await userApi.getPromptHistory(true); // 只获取成功的
      setPromptHistory(history);
    } catch (err) {
      console.error('加载提示词历史失败:', err);
    }
  }, [currentUser]);

  // 提交反馈
  const handleFeedback = async (rating: 1 | -1) => {
    if (!lastGeneratedImageId || !currentUser) return;
    try {
      await feedbackApi.submit(lastGeneratedImageId, rating);
      setFeedbackSubmitted(true);
    } catch (err) {
      console.error('提交反馈失败:', err);
    }
  };

  // 批量生成
  const handleBatchGenerate = async () => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    if (!imageBase64 || !selectedTemplate) {
      setError('请先上传眼镜图片并选择模板');
      return;
    }

    const selectedCombos = batchCombinations.filter(c => c.selected);
    if (selectedCombos.length === 0) {
      setError('请至少选择一个组合');
      return;
    }

    setIsBatchGenerating(true);
    setBatchResults([]);
    setTaskPollingEnabled(true);

    try {
      // 构建组合，包含英文变量
      const combinations = selectedCombos.map(combo => ({
        ethnicity: ethnicityToEnglish[combo.ethnicity] || combo.ethnicity,
        age: ageToEnglish[combo.age] || combo.age,
      }));

      // 提交异步批量任务
      const res = await taskApi.submitBatch(
        imageBase64,
        selectedTemplate.prompt,
        combinations,
        userAspectRatio as AspectRatio,
        selectedTemplate.id,
        selectedTemplate.name
      );

      // 添加到本地任务列表
      setActiveTasks(prev => [{
        id: res.taskId,
        type: 'batch',
        status: 'pending',
        progress: 0,
        createdAt: Date.now()
      }, ...prev]);

      // 提示用户
      setError(null);
    } catch (err: any) {
      setError(err.message || '批量任务提交失败');
    } finally {
      setIsBatchGenerating(false);
    }
  };

  // 初始化批量组合
  const initBatchCombinations = () => {
    // 使用与单个生成相同的族裔选项
    const ethnicities = ['中国人', '日本人', '韩国人', '白人', '黑人', '亚欧混血'];
    const ages = ['青年', '成年', '成熟'];
    const combos: Array<{ ethnicity: string; age: string; selected: boolean }> = [];
    ethnicities.forEach(e => {
      ages.forEach(a => {
        combos.push({ ethnicity: e, age: a, selected: false });
      });
    });
    setBatchCombinations(combos);
  };

  // 用户历史记录
  const [userHistory, setUserHistory] = useState<GeneratedImage[]>([]);
  const [publicGallery, setPublicGallery] = useState<GeneratedImage[]>([]);
  const [galleryViewMode, setGalleryViewMode] = useState<'mine' | 'community'>('mine');
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);

  // 修改密码状态
  const [passwordChangeState, setPasswordChangeState] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    loading: false,
    error: null as string | null,
    success: false
  });

  // 加载模板数据
  const loadTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true);
      const data = await templateApi.getAll();
      setTemplates(data);
    } catch (err) {
      console.error('加载模板失败:', err);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  // 加载标签数据
  const loadTags = useCallback(async () => {
    try {
      const data = await tagApi.getAll();
      setAllTags(data);
    } catch (err) {
      console.error('加载标签失败:', err);
    }
  }, []);

  // 加载用户历史记录
  const loadUserHistory = useCallback(async () => {
    if (!currentUser) return;
    try {
      const images = await userApi.getHistory();
      setUserHistory(images);
    } catch (err) {
      console.error('加载历史记录失败:', err);
    }
  }, [currentUser]);

  // 加载社区公开作品
  const loadPublicGallery = useCallback(async () => {
    try {
      const images = await userApi.getPublicGallery();
      setPublicGallery(images);
    } catch (err) {
      console.error('加载社区作品失败:', err);
    }
  }, []);

  // 分享/取消分享作品
  const handleShareImage = useCallback(async (imageId: string, isPublic: boolean) => {
    try {
      const result = await userApi.shareImage(imageId, isPublic);
      if (result.success) {
        // 更新本地状态
        setUserHistory(prev => prev.map(img =>
          img.id === imageId ? { ...img, isPublic } : img
        ));
        // 如果是分享，刷新社区画廊
        if (isPublic) {
          loadPublicGallery();
        }
      }
    } catch (err) {
      console.error('分享操作失败:', err);
      alert('操作失败，请重试');
    }
  }, [loadPublicGallery]);

  // 验证登录状态
  useEffect(() => {
    const verifyAuth = async () => {
      if (authApi.isLoggedIn()) {
        const user = await authApi.verify();
        setCurrentUser(user);
      }
      setIsAuthChecked(true);
    };
    verifyAuth();
    loadTemplates();
    loadTags();
  }, [loadTemplates, loadTags]);

  // 当用户登录后加载历史记录、收藏、提示词历史
  useEffect(() => {
    if (currentUser) {
      loadUserHistory();
      loadFavorites();
      loadPromptHistory();
    }
    // 社区作品不需要登录也可以加载
    loadPublicGallery();
  }, [currentUser, loadUserHistory, loadFavorites, loadPromptHistory, loadPublicGallery]);

  // 任务轮询：定期检查活跃任务状态
  useEffect(() => {
    if (!currentUser || !taskPollingEnabled) return;

    const pollTasks = async () => {
      try {
        const { tasks } = await taskApi.getTasks(true);  // 只获取活跃任务
        setActiveTasks(tasks as TaskItem[]);

        // 查找最新完成的任务
        const completedTasks = tasks.filter((t: any) => t.status === 'completed');
        if (completedTasks.length > 0) {
          // 刷新历史记录
          loadUserHistory();

          // 如果用户正在等待结果（generatedImage 为空），自动加载展示最新完成的一张
          // 或者如果主预览区还是之前的旧图，也可以考虑更新
          const latestCompleted = completedTasks.sort((a, b) => b.createdAt - a.createdAt)[0];
          if (latestCompleted && (latestCompleted.outputData?.imageUrl || (latestCompleted as any).result?.imageUrl)) {
            setGeneratedImage(latestCompleted.outputData?.imageUrl || (latestCompleted as any).result?.imageUrl);
          }
        }
      } catch (err) {
        console.error('任务轮询失败:', err);
      }
    };

    // 立即执行一次
    pollTasks();

    // 每3秒轮询一次（提高实时感）
    const interval = setInterval(pollTasks, 3000);
    return () => clearInterval(interval);
  }, [currentUser, taskPollingEnabled, loadUserHistory]);

  // 普通用户登录
  const handleUserLogin = async (username: string, password: string): Promise<User> => {
    const result = await authApi.login(username, password);
    setCurrentUser(result.user);
    return result.user;
  };

  // 普通用户注册
  const handleUserRegister = async (username: string, password: string): Promise<User> => {
    const result = await authApi.register(username, password);
    setCurrentUser(result.user);
    return result.user;
  };

  // 用户登出
  const handleUserLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      setCurrentUser(null);
      setUserHistory([]);
    }
  };

  // 管理员表单登录（后台管理页专用）
  const handleAdminLogin = async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const result = await authApi.login(adminUsername, adminPassword);
      setCurrentUser(result.user);
      setAdminUsername('');
      setAdminPassword('');
    } catch (err: any) {
      setLoginError(err.message || '登录失败');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    await handleUserLogout();
  };

  // 修改密码
  const handleChangePassword = async () => {
    const { oldPassword, newPassword, confirmPassword } = passwordChangeState;

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordChangeState(s => ({ ...s, error: '请填写所有字段' }));
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordChangeState(s => ({ ...s, error: '两次输入的新密码不一致' }));
      return;
    }

    if (newPassword.length < 6) {
      setPasswordChangeState(s => ({ ...s, error: '新密码长度至少6位' }));
      return;
    }

    setPasswordChangeState(s => ({ ...s, loading: true, error: null }));
    try {
      await authApi.changePassword(oldPassword, newPassword);
      setPasswordChangeState({
        oldPassword: '',
        newPassword: '',
        confirmPassword: '',
        loading: false,
        error: null,
        success: true
      });
      setTimeout(() => {
        setPasswordChangeState(s => ({ ...s, success: false }));
      }, 3000);
    } catch (err: any) {
      setPasswordChangeState(s => ({ ...s, loading: false, error: err.message || '密码修改失败' }));
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setPreviewUrl(URL.createObjectURL(file));
      setImageBase64(await convertBlobToBase64(file));
      setGeneratedImage(null);
      setMode(AppMode.DASHBOARD);
    }
  };

  // 使用自定义提示词生成（用户可编辑后直接生成）
  const handleGenerateWithPrompt = async (customPrompt: string, aspectRatio?: string, shouldNavigate = true) => {
    if (!currentUser) {
      setError('请先登录后再生成图片');
      navigate('/login');
      return;
    }
    if (!imageBase64) {
      setError('请先上传眼镜图片');
      return;
    }

    setIsGenerating(true);
    setGeneratedImage(null); // 清除上一张图，显示加载状态
    setError(null);

    if (shouldNavigate) {
      navigate('/');
      setMode(AppMode.RESULT);
    }

    // 开启任务轮询
    setTaskPollingEnabled(true);

    try {
      // 提交异步任务
      const res = await taskApi.submitGenerate(
        imageBase64,
        customPrompt,
        aspectRatio || userAspectRatio,
        selectedTemplate?.id || 'custom',
        selectedTemplate?.name
      );

      // 添加到本地任务列表以立即显示
      setActiveTasks(prev => [{
        id: res.taskId,
        type: 'generate',
        status: 'pending',
        progress: 0,
        createdAt: Date.now()
      }, ...prev]);

      // 提示用户
      // setError(null); // 使用Error显示消息其实不太好，最好有个Toast，这里暂时不做改动
    } catch (err: any) {
      setError(err.message || '任务提交失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAdminAddTemplate = async () => {
    if (!newTemplateImage || !newTemplatePrompt) {
      setError('请上传图片并填写提示词');
      return;
    }
    try {
      const newTpl: TemplateItem = {
        id: Date.now().toString(),
        imageUrl: newTemplateImage,
        name: newTemplateName || '新上传模板',
        description: newTemplateDesc || '',
        prompt: newTemplatePrompt,
        tags: newTemplateTags,
        variables: newTemplateVariables
      };
      await templateApi.create(newTpl);
      await loadTemplates();
      // 重置表单
      setNewTemplateImage(null);
      setNewTemplateName('');
      setNewTemplateDesc('');
      setNewTemplatePrompt('');
      setNewTemplateTags([]);
      setNewTemplateVariables([]);
      alert('模板已添加至广场');
    } catch (err: any) {
      setError(err.message || '添加模板失败');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await templateApi.delete(id);
      await loadTemplates(); // 重新加载模板列表
    } catch (err: any) {
      setError(err.message || "删除模板失败");
    }
  };

  const handleRun = async () => {
    // 检查登录状态
    if (!currentUser) {
      setError('请先登录后再生成图片');
      navigate('/login');
      return;
    }

    setIsGenerating(true);
    setError(null);
    // 开启任务轮询
    setTaskPollingEnabled(true);

    try {
      // 提交异步任务
      // 注意：自定义配置模式下没有 templateId，prompt 由后端根据 config 生成
      const res = await taskApi.submitGenerate(
        imageBase64,
        '', // prompt 为空，后端根据 modelConfig 生成
        modelConfig.aspectRatio || '3:4',
        'custom', // 标记为 custom
        'Custom Generation',
        undefined,
        modelConfig,
        userImageQuality
      );

      // 添加到本地任务列表
      setActiveTasks(prev => [{
        id: res.taskId,
        type: 'generate',
        status: 'pending',
        progress: 0,
        createdAt: Date.now()
      }, ...prev]);

      setMode(AppMode.RESULT);
    } catch (err: any) {
      if (err.message?.includes('未授权') || err.message?.includes('过期')) {
        setCurrentUser(null);
        navigate('/login');
      }
      setError(err.message || "任务提交失败，请检查配置。");
    } finally {
      setIsGenerating(false);
    }
  };

  // 渲染模板广场
  const renderTemplateGallery = () => {
    // 根据筛选标签过滤模板
    const filteredTemplates = filterTag
      ? templates.filter(t => t.tags?.includes(filterTag))
      : templates;

    return (
      <div className="space-y-8 lg:space-y-12 animate-fade-in pb-20">
        <div className="space-y-2 lg:space-y-4 text-center max-w-xl mx-auto">
          <h2 className="text-3xl lg:text-5xl font-serif italic text-white">模板广场</h2>
          <p className="text-zinc-500 text-[10px] lg:text-xs uppercase tracking-[0.2em] lg:tracking-[0.3em] font-black">Curated Masterpiece Library</p>
        </div>

        {/* 标签筛选栏 - 移动端横向滚动 */}
        <div className="flex gap-2 lg:gap-3 overflow-x-auto pb-2 lg:pb-0 lg:flex-wrap lg:justify-center scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
          <button
            onClick={() => setFilterTag(null)}
            className={`px-4 lg:px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap flex-shrink-0 ${!filterTag ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-500 border border-white/5 hover:border-white/20'}`}
          >
            全部
          </button>
          {allTags?.map && allTags.map(tag => (
            <button
              key={tag.id}
              onClick={() => setFilterTag(tag.id)}
              className={`px-4 lg:px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap flex-shrink-0 ${filterTag === tag.id ? 'text-white' : 'bg-zinc-900 text-zinc-500 border border-white/5 hover:border-white/20'}`}
              style={filterTag === tag.id ? { backgroundColor: tag.color } : {}}
            >
              {tag.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {filteredTemplates.length === 0 && (
            <div className="col-span-full py-32 text-center ios-card">
              <p className="text-zinc-600 font-black uppercase tracking-widest text-[10px]">暂无匹配的模板</p>
            </div>
          )}
          {filteredTemplates?.map && filteredTemplates.map(tpl => (
            <div
              key={tpl.id}
              onClick={() => {
                setSelectedTemplate(tpl);
                // 根据模板的prompt类型设置默认选择
                if (tpl.femalePrompt) {
                  setSelectedGender('female');
                  setEditablePrompt(tpl.femalePrompt);
                } else if (tpl.malePrompt) {
                  setSelectedGender('male');
                  setEditablePrompt(tpl.malePrompt);
                } else {
                  setEditablePrompt(tpl.prompt);
                }
                setShowTemplateDetail(true);
              }}
              className="group relative aspect-[3/4] rounded-2xl lg:rounded-[3rem] overflow-hidden cursor-pointer border border-white/5 hover:border-white/20 transition-all duration-700 hover:scale-[1.02] shadow-xl lg:shadow-2xl"
            >
              <img
                src={getImageUrl(tpl.imageUrl)}
                className="w-full h-full object-cover transition-all duration-500"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://placehold.co/600x800/101010/FFF?text=No+Image';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity"></div>
              {/* 标签显示 */}
              <div className="absolute top-6 left-6 flex flex-wrap gap-2">
                {tpl.tags?.map(tagId => {
                  const tag = allTags.find(t => t.id === tagId);
                  return tag ? (
                    <span key={tagId} className="px-3 py-1 rounded-full text-[8px] font-bold text-white" style={{ backgroundColor: tag.color }}>
                      {tag.name}
                    </span>
                  ) : null;
                })}
              </div>
              <div className="absolute bottom-6 left-6 right-6 lg:bottom-10 lg:left-10 lg:right-10 space-y-2 lg:space-y-3 translate-y-4 group-hover:translate-y-0 transition-all duration-700">
                <h3 className="text-lg lg:text-2xl font-serif italic text-white">{tpl.name}</h3>
                <p className="text-zinc-400 text-[9px] lg:text-[10px] uppercase tracking-widest font-bold line-clamp-1">{tpl.description}</p>
                <div className="pt-2 lg:pt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="px-4 lg:px-5 py-1.5 lg:py-2 rounded-full bg-white text-black text-[8px] lg:text-[9px] font-black uppercase tracking-widest">查看详情</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 模板详情弹窗 - 增强版 */}
        {showTemplateDetail && selectedTemplate && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowTemplateDetail(false); setIsBatchMode(false); setIsEditMode(false); }}>
            <div className="bg-zinc-900 rounded-[2rem] max-w-3xl w-full max-h-[95vh] overflow-y-auto p-6 space-y-5" onClick={e => e.stopPropagation()}>
              {/* 头部：模板信息 + 收藏按钮 */}
              <div className="flex items-start gap-4">
                <img
                  src={getImageUrl(selectedTemplate.imageUrl)}
                  className="w-28 h-36 object-cover rounded-2xl flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://placehold.co/600x800/101010/FFF?text=No+Image';
                  }}
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xl font-serif italic text-white truncate">{selectedTemplate.name}</h3>
                    <button
                      onClick={() => handleToggleFavorite(selectedTemplate.id)}
                      className={`p-2 rounded-xl transition-all flex-shrink-0 ${favorites.has(selectedTemplate.id) ? 'bg-pink-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-pink-400'}`}
                    >
                      <svg className="w-5 h-5" fill={favorites.has(selectedTemplate.id) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-zinc-500 text-xs line-clamp-2">{selectedTemplate.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTemplate.tags?.map(tagId => {
                      const tag = allTags.find(t => t.id === tagId);
                      return tag ? (
                        <span key={tagId} className="px-2 py-0.5 rounded-full text-[8px] font-bold text-white" style={{ backgroundColor: tag.color }}>
                          {tag.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>

              {/* 性别选择（仅当模板有男或女版本时显示） */}
              {(selectedTemplate.malePrompt || selectedTemplate.femalePrompt) && (
                <div className="p-4 bg-gradient-to-r from-pink-900/20 to-blue-900/20 border border-white/5 rounded-2xl space-y-3">
                  <label className="text-[10px] text-zinc-400 uppercase tracking-widest font-black">选择版本</label>
                  <div className="flex gap-3">
                    {selectedTemplate.femalePrompt && (
                      <button
                        onClick={() => {
                          setSelectedGender('female');
                          if (!isEditMode) {
                            setEditablePrompt(selectedTemplate.femalePrompt!);
                          }
                        }}
                        className={`${selectedTemplate.malePrompt ? 'flex-1' : 'w-full'} py-3 rounded-xl text-sm font-bold transition-all ${selectedGender === 'female'
                          ? 'bg-pink-600 text-white shadow-lg shadow-pink-900/50'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                      >
                        👩 女性版本
                      </button>
                    )}
                    {selectedTemplate.malePrompt && (
                      <button
                        onClick={() => {
                          setSelectedGender('male');
                          if (!isEditMode) {
                            setEditablePrompt(selectedTemplate.malePrompt!);
                          }
                        }}
                        className={`${selectedTemplate.femalePrompt ? 'flex-1' : 'w-full'} py-3 rounded-xl text-sm font-bold transition-all ${selectedGender === 'male'
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                      >
                        👨 男性版本
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-zinc-500 text-center">
                    {selectedTemplate.femalePrompt && selectedTemplate.malePrompt
                      ? (selectedGender === 'female' ? '使用女性模特提示词' : '使用男性模特提示词')
                      : selectedTemplate.femalePrompt
                        ? '使用女性模特提示词'
                        : '使用男性模特提示词'
                    }
                  </p>
                </div>
              )}

              {/* 模式切换标签 */}
              <div className="flex bg-zinc-800/50 p-1 rounded-xl">
                <button
                  onClick={() => { setIsEditMode(false); }}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${!isEditMode ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                >
                  快速生成
                </button>
                <button
                  onClick={() => { setIsEditMode(true); setEditedPrompt(getFullPrompt(selectedTemplate)); }}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${isEditMode ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                >
                  编辑提示词
                </button>
              </div>

              {/* 编辑提示词模式 */}
              {isEditMode && (
                <div className="space-y-4 p-4 bg-purple-900/20 border border-purple-500/20 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-purple-400 uppercase tracking-widest font-black">编辑提示词</label>
                    <button
                      onClick={() => setEditedPrompt(getFullPrompt(selectedTemplate))}
                      className="text-[9px] text-zinc-500 hover:text-white"
                    >
                      重置
                    </button>
                  </div>
                  <textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    rows={10}
                    className="w-full px-4 py-3 bg-zinc-800 border border-white/5 rounded-xl text-zinc-300 text-xs font-mono focus:outline-none focus:border-purple-500/50 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopyPrompt(editedPrompt)}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-bold transition-all ${promptCopied ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                    >
                      {promptCopied ? '✓ 已复制' : '复制提示词'}
                    </button>
                    <button
                      onClick={() => {
                        if (!imageBase64) {
                          setError('请先上传眼镜图片');
                          return;
                        }
                        setShowTemplateDetail(false);
                        setIsEditMode(false);
                        handleGenerateWithPrompt(editedPrompt, userAspectRatio);
                      }}
                      className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-[10px] font-bold hover:bg-purple-500"
                    >
                      使用编辑后的提示词生成
                    </button>
                  </div>
                </div>
              )}

              {/* 单张生成模式 - 常规选项 */}
              {!isBatchMode && !isEditMode && (
                <>
                  {/* 基础模特选项 */}
                  <div className="space-y-3">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">基础选项</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-zinc-400 font-bold">族裔</label>
                        <select value={userModelEthnicity} onChange={(e) => setUserModelEthnicity(e.target.value)} className="w-full px-3 py-2.5 bg-zinc-800 border border-white/5 rounded-xl text-white text-xs focus:outline-none focus:border-white/20">
                          <optgroup label="亚洲">
                            <option value="中国人">中国人</option>
                            <option value="日本人">日本人</option>
                            <option value="韩国人">韩国人</option>
                            <option value="东南亚人">东南亚人</option>
                            <option value="印度人">印度人</option>
                            <option value="中东人">中东人</option>
                          </optgroup>
                          <optgroup label="欧美">
                            <option value="白人">白人</option>
                            <option value="黑人">黑人</option>
                            <option value="拉丁裔">拉丁裔</option>
                          </optgroup>
                          <optgroup label="混血">
                            <option value="亚欧混血">亚欧混血</option>
                            <option value="多元族裔">多元族裔</option>
                          </optgroup>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-zinc-400 font-bold">年龄</label>
                        <select value={userModelAge} onChange={(e) => setUserModelAge(e.target.value)} className="w-full px-3 py-2.5 bg-zinc-800 border border-white/5 rounded-xl text-white text-xs focus:outline-none focus:border-white/20">
                          <option value="小孩">小孩</option>
                          <option value="青少年">青少年</option>
                          <option value="青年">青年</option>
                          <option value="成年">成年</option>
                          <option value="成熟">成熟</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 提示：核心选项 */}
                  <p className="text-[9px] text-zinc-600 text-center">
                    其他选项由模板预设决定，保持最佳效果
                  </p>

                  {/* 图像选项 */}
                  <div className="space-y-3">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">图像选项</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-zinc-400 font-bold">清晰度</label>
                        <select value={userImageQuality} onChange={(e) => setUserImageQuality(e.target.value as '1K' | '2K' | '4K')} className="w-full px-3 py-2.5 bg-zinc-800 border border-white/5 rounded-xl text-white text-xs focus:outline-none focus:border-white/20">
                          <option value="1K">1K</option>
                          <option value="2K">2K</option>
                          <option value="4K">4K</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-zinc-400 font-bold">画面比例</label>
                        <select value={userAspectRatio} onChange={(e) => setUserAspectRatio(e.target.value as any)} className="w-full px-3 py-2.5 bg-zinc-800 border border-white/5 rounded-xl text-white text-xs focus:outline-none focus:border-white/20">
                          <option value="1:1">1:1</option>
                          <option value="3:4">3:4</option>
                          <option value="4:3">4:3</option>
                          <option value="9:16">9:16</option>
                          <option value="16:9">16:9</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 提示词预览 */}
                  <details className="group">
                    <summary className="text-[10px] text-zinc-500 uppercase tracking-widest font-black cursor-pointer hover:text-zinc-400 flex items-center gap-2">
                      <span>完整提示词预览</span>
                      <svg className="w-3 h-3 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </summary>
                    <div className="mt-3 relative">
                      <pre className="px-4 py-3 bg-zinc-800/50 border border-white/5 rounded-xl text-zinc-300 text-[10px] leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
                        {getFullPrompt(selectedTemplate)}
                      </pre>
                      <button
                        onClick={() => handleCopyPrompt(getFullPrompt(selectedTemplate))}
                        className={`absolute top-2 right-2 px-2 py-1 rounded-lg text-[8px] font-bold transition-all ${promptCopied ? 'bg-green-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}
                      >
                        {promptCopied ? '✓' : '复制'}
                      </button>
                    </div>
                  </details>
                </>
              )}

              {/* 底部操作按钮 */}
              {!isBatchMode && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setShowTemplateDetail(false); setIsEditMode(false); }}
                    className="flex-1 py-3.5 rounded-2xl bg-zinc-800 text-zinc-400 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-700 transition-colors"
                  >
                    取消
                  </button>
                  {!isEditMode && (
                    <button
                      onClick={() => {
                        if (!imageBase64) {
                          setShowTemplateDetail(false);
                          navigate('/');
                          setError('请先上传您的眼镜图片');
                          return;
                        }
                        const finalPrompt = getFullPrompt(selectedTemplate);
                        setShowTemplateDetail(false);
                        // 在模板广场生成时，不跳转回主页
                        handleGenerateWithPrompt(finalPrompt, userAspectRatio, false);
                      }}
                      className="flex-1 py-3.5 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-colors"
                    >
                      立即生成
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // 渲染配置页面
  const renderConfig = () => {
    const ethnicityMap = { 'East Asian': '东亚', 'Caucasian': '欧裔', 'African': '非裔', 'Hispanic/Latino': '拉丁裔' };
    const purposeMap = { 'Brand Campaign': '品牌大片', 'E-commerce Main': '电商主图', 'Social Media': '社媒推广' };
    const framingMap = { 'Close-up': '特写', 'Bust Shot': '胸像', 'Upper Body': '腰部半身', 'Full Body': '全身' };

    return (
      <div className="space-y-12 animate-fade-in pb-32 max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-4xl font-serif italic text-white">视觉配置</h2>
          <div className="flex bg-zinc-900 p-1 rounded-2xl border border-white/5">
            <button onClick={() => setConfigDepth('basic')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${configDepth === 'basic' ? 'bg-white text-black' : 'text-zinc-500'}`}>基础</button>
            <button onClick={() => setConfigDepth('master')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${configDepth === 'master' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-zinc-500'}`}>大师</button>
          </div>
        </div>

        <div className="space-y-10">
          <SelectorGroup title="角色模型" icon={<IconModel />} color="text-white">
            <Selector label="族裔" options={Object.keys(ethnicityMap)} current={modelConfig.ethnicity} onChange={(v: any) => setModelConfig(p => ({ ...p, ethnicity: v }))} labelMap={ethnicityMap} />
            <div className="grid grid-cols-2 gap-8">
              <Selector label="年龄段" options={['Youth', 'Adult', 'Mature']} current={modelConfig.age} onChange={(v: any) => setModelConfig(p => ({ ...p, age: v }))} labelMap={{ 'Youth': '青年', 'Adult': '成熟', 'Mature': '资深' }} />
              <Selector label="性别" options={['Female', 'Male']} current={modelConfig.gender} onChange={(v: any) => setModelConfig(p => ({ ...p, gender: v }))} labelMap={{ 'Female': '女性', 'Male': '男性' }} />
            </div>
          </SelectorGroup>

          <SelectorGroup title="摄影规格" icon={<IconCamera />} color="text-blue-400">
            <Selector label="景别选择" options={Object.keys(framingMap)} current={modelConfig.framing} onChange={(v: any) => setModelConfig(p => ({ ...p, framing: v }))} labelMap={framingMap} />
            <Selector label="商业用途" options={Object.keys(purposeMap)} current={modelConfig.visualPurpose} onChange={(v: any) => setModelConfig(p => ({ ...p, visualPurpose: v }))} labelMap={purposeMap} />
          </SelectorGroup>

          {configDepth === 'master' && (
            <SelectorGroup title="光学渲染 (Master Only)" icon={<IconCreative />} color="text-yellow-400">
              <Selector label="摄影机" options={['Hasselblad H6D', 'Sony A7R V', 'Leica M11']} current={modelConfig.camera} onChange={(v: any) => setModelConfig(p => ({ ...p, camera: v }))} />
              <Selector label="灯光策略" options={['Softbox Diffused', 'Butterfly (Paramount)', 'Rembrandt', 'Neon Noir']} current={modelConfig.lighting} onChange={(v: any) => setModelConfig(p => ({ ...p, lighting: v }))} />
              <Selector label="胶片色调" options={['Natural Soft', 'Vintage Film', 'Cinematic Teal & Orange']} current={modelConfig.mood} onChange={(v: any) => setModelConfig(p => ({ ...p, mood: v }))} />
            </SelectorGroup>
          )}

          <Button onClick={handleRun} className={`w-full h-24 rounded-[2.5rem] font-black text-[12px] shadow-2xl transition-all duration-500 ${configDepth === 'master' ? 'bg-blue-600 text-white' : 'bg-white text-black'}`} isLoading={isGenerating}>
            {!currentUser ? '登录后生成' : configDepth === 'master' ? '执行大师级渲染' : '即刻生成大片'}
          </Button>
          {!currentUser && (
            <p className="text-center text-zinc-600 text-[10px] uppercase tracking-widest font-black mt-4">
              需要登录才能生成图片
            </p>
          )}
        </div>
      </div>
    );
  };

  // 渲染产品图配置
  const renderProductShot = () => {
    return (
      <div className="space-y-12 animate-fade-in pb-32 max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-4xl font-serif italic text-white">产品摄影</h2>
          <Button variant="outline" onClick={() => setMode(AppMode.DASHBOARD)} className="px-6 py-2 rounded-xl text-[10px]">返回</Button>
        </div>

        <div className="space-y-10">
          <SelectorGroup title="拍摄角度" icon={<IconCamera />} color="text-purple-400">
            <div className="flex flex-wrap gap-3">
              {[
                { id: 'front', label: '正视图' },
                { id: 'front_45_left', label: '左侧45°' },
                { id: 'side_left', label: '左侧面' },
                { id: 'perspective', label: '透视' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => {
                    // 多选逻辑
                    const newAngles = productShotConfig.angles.includes(opt.id as any)
                      ? productShotConfig.angles.filter(a => a !== opt.id)
                      : [...productShotConfig.angles, opt.id];
                    if (newAngles.length > 0) {
                      setProductShotConfig(p => ({ ...p, angles: newAngles as any[] }));
                    }
                  }}
                  className={`px-5 py-4 rounded-2xl text-[10px] font-bold border transition-all duration-300 ${productShotConfig.angles.includes(opt.id as any)
                    ? 'bg-purple-600 text-white border-purple-500 shadow-lg'
                    : 'bg-zinc-900 text-zinc-500 border-white/5 hover:border-white/20'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-zinc-600 pl-2">可多选，批量生成不同角度</p>
          </SelectorGroup>

          <SelectorGroup title="布景与光影" icon={<IconCreative />} color="text-blue-400">
            <Selector
              label="背景风格"
              options={['pure_white', 'light_gray', 'warm_beige', 'black']}
              current={productShotConfig.backgroundColor}
              onChange={(v: any) => setProductShotConfig(p => ({ ...p, backgroundColor: v }))}
              labelMap={{ 'pure_white': '纯白棚拍', 'light_gray': '高级灰', 'warm_beige': '暖调米色', 'black': '深邃黑' }}
            />
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-black">倒影增强</label>
                <button
                  onClick={() => setProductShotConfig(p => ({ ...p, reflectionEnabled: !p.reflectionEnabled }))}
                  className={`w-full py-4 rounded-2xl border text-[10px] font-bold transition-all ${productShotConfig.reflectionEnabled
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900 text-zinc-500 border-white/5'
                    }`}
                >
                  {productShotConfig.reflectionEnabled ? '已开启' : '已关闭'}
                </button>
              </div>
              <Selector
                label="阴影风格"
                options={['soft', 'dramatic', 'none']}
                current={productShotConfig.shadowStyle}
                onChange={(v: any) => setProductShotConfig(p => ({ ...p, shadowStyle: v }))}
                labelMap={{ 'soft': '柔和', 'dramatic': '硬朗', 'none': '无' }}
              />
            </div>
          </SelectorGroup>

          <Button
            onClick={() => {
              // 模拟提交
              if (!currentUser) { navigate('/login'); return; }
              setIsGenerating(true);
              setTimeout(() => {
                setIsGenerating(false);
                setMode(AppMode.RESULT);
                setGeneratedImage("https://placehold.co/1024x1366/1a1a1a/ffffff?text=Product+Shot+Result");
              }, 2000);
            }}
            className="w-full h-24 rounded-[2.5rem] font-black text-[12px] shadow-2xl bg-purple-600 text-white"
            isLoading={isGenerating}
          >
            开始渲染产品大片
          </Button>
        </div>
      </div>
    );
  };

  // 渲染登录表单
  const renderLoginForm = () => (
    <div className="max-w-md mx-auto space-y-12 animate-fade-in pt-20">
      <div className="space-y-4 text-center">
        <div className="w-20 h-20 bg-zinc-900 rounded-3xl mx-auto flex items-center justify-center border border-white/5">
          <IconSettings />
        </div>
        <h2 className="text-4xl font-serif italic text-white">管理员登录</h2>
        <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-black">Secure Access Required</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">用户名</label>
          <input
            type="text"
            value={adminUsername}
            onChange={(e) => setAdminUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
            className="w-full px-6 py-5 bg-zinc-900 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-white/20 transition-colors"
            placeholder="请输入用户名"
          />
        </div>
        <div className="space-y-3">
          <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">密码</label>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
            className="w-full px-6 py-5 bg-zinc-900 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-white/20 transition-colors"
            placeholder="请输入密码"
          />
        </div>
        {loginError && (
          <p className="text-red-500 text-[10px] uppercase tracking-widest font-black text-center">{loginError}</p>
        )}
        <Button onClick={handleAdminLogin} isLoading={loginLoading} className="w-full h-16 rounded-2xl bg-white text-black font-black text-sm mt-4">
          登录
        </Button>
      </div>
    </div>
  );

  // 渲染管理员页面
  const renderAdmin = () => {
    // 需要管理员权限
    if (!currentUser || currentUser.role !== 'admin') {
      return renderLoginForm();
    }

    return (
      <div className="max-w-6xl mx-auto space-y-10 animate-fade-in px-4 pb-20">
        {/* 页眉区域 */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <IconSettings className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-6xl font-serif italic text-white tracking-tight">Admin <span className="text-zinc-500 not-italic text-2xl ml-2 font-light">Panel</span></h2>
            </div>
            <p className="text-zinc-500 text-xs uppercase tracking-[0.2em] font-black pl-1">专业的模板与标签内容管理系统</p>
          </div>
          <button
            onClick={handleAdminLogout}
            className="group flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-zinc-400 text-[10px] uppercase tracking-widest font-black hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all active:scale-95"
          >
            <span>退出管理系统</span>
            <IconLogout className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* 顶部统计或全局操作栏（可选） */}

        {/* 导航 Tab */}
        <div className="flex bg-[#0a0a0a] p-1.5 rounded-[2rem] border border-white/5 w-fit shadow-2xl backdrop-blur-xl">
          {[
            { id: 'create', label: '✨ 创建新模板', activeColor: 'bg-white text-black' },
            { id: 'templates', label: '📋 已发布模板', activeColor: 'bg-white text-black' },
            { id: 'tags', label: '🏷️ 标签库管理', activeColor: 'bg-white text-black' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setAdminTab(tab.id as any)}
              className={`px-8 py-4 rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest transition-all duration-500 ${adminTab === tab.id
                ? `${tab.activeColor} shadow-xl scale-[1.02]`
                : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <div className="min-h-[60vh]">
          {/* 创建新模板 */}
          {adminTab === 'create' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 items-start">
              {/* 左侧：视觉预览与上传 */}
              <div className="xl:col-span-5 space-y-6 sticky top-10">
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 pl-2">效果示例预览</h3>
                  <div
                    onClick={() => adminFileInputRef.current?.click()}
                    className={`aspect-[3/4] rounded-[3.5rem] border-2 border-dashed transition-all duration-700 group relative flex flex-col items-center justify-center cursor-pointer overflow-hidden ${newTemplateImage
                      ? 'border-white/20 bg-zinc-900'
                      : 'border-white/5 bg-[#080808] hover:border-indigo-500/30 hover:bg-indigo-500/5'
                      }`}
                  >
                    {newTemplateImage ? (
                      <>
                        <img src={getImageUrl(newTemplateImage)} className="w-full h-full object-cover animate-fade-in" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                              <IconEdit className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-white text-[10px] font-black uppercase tracking-widest">点击更换示例图</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center space-y-6 p-10 animate-fade-in">
                        <div className="w-20 h-20 rounded-[2rem] bg-zinc-900 border border-white/5 mx-auto flex items-center justify-center group-hover:scale-110 group-hover:border-indigo-500/50 transition-all duration-500 shadow-2xl">
                          <IconUpload className="w-8 h-8 text-zinc-600 group-hover:text-indigo-400 transition-colors" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-white text-sm font-bold">上传高质量示例图</p>
                          <p className="text-zinc-600 text-[10px] uppercase tracking-widest leading-relaxed">尺寸建议 3:4<br />这决定了用户在广场看到的第一印象</p>
                        </div>
                      </div>
                    )}
                    <input type="file" ref={adminFileInputRef} className="hidden" onChange={async (e) => {
                      if (e.target.files?.[0]) setNewTemplateImage(`data:image/jpeg;base64,${await convertBlobToBase64(e.target.files[0])}`);
                    }} />
                  </div>
                </div>

                {/* AI 预览提示卡片 */}
                {!showOptimizedPrompts && !editingTemplate && (
                  <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-indigo-900/10 via-zinc-900/50 to-transparent border border-white/5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                        <span className="text-lg">💡</span>
                      </div>
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-zinc-300">智能创作建议</h4>
                    </div>
                    <ul className="space-y-3 text-[10px] text-zinc-500 leading-relaxed font-medium">
                      <li className="flex gap-3"><span className="text-indigo-500">01</span> 先填入基础风格描述，AI 会为您扩展细节</li>
                      <li className="flex gap-3"><span className="text-indigo-500">02</span> 系统会自动生成贴合眼镜佩戴场景的 Prompt</li>
                      <li className="flex gap-3"><span className="text-indigo-500">03</span> 您可以随时在 AI 生成结果基础上进行二次微调</li>
                    </ul>
                  </div>
                )}
              </div>

              {/* 右侧：配置参数表单 */}
              <div className="xl:col-span-7 space-y-8">
                <div className="glass-card rounded-[3.5rem] p-10 space-y-10 border border-white/5 shadow-2xl">
                  {/* 分组：基础信息 */}
                  <div className="space-y-8">
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-sm">📝</span>
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-white">模板基础档案</h4>
                      </div>
                      {editingTemplate && (
                        <button
                          onClick={() => {
                            setEditingTemplate(null);
                            setNewTemplateImage(null);
                            setNewTemplateName('');
                            setNewTemplateDesc('');
                            setNewTemplatePrompt('');
                            setNewTemplateTags([]);
                            setOptimizedPrompts({ female: null, male: null });
                            setShowOptimizedPrompts(false);
                          }}
                          className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase tracking-widest hover:bg-red-900/40 hover:text-red-300 transition-all active:scale-95"
                        >
                          跳出编辑模式
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* 模板名称 */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">模板显示名称</label>
                          {newTemplateName && <span className="text-[9px] text-zinc-700 animate-pulse">已填写</span>}
                        </div>
                        <input
                          type="text"
                          value={newTemplateName}
                          onChange={(e) => setNewTemplateName(e.target.value)}
                          className="w-full px-6 py-4 bg-[#080808] border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-zinc-800"
                          placeholder="例如：米兰时装周街拍"
                        />
                      </div>

                      {/* 描述 */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">模板简短描述</label>
                        </div>
                        <input
                          type="text"
                          value={newTemplateDesc}
                          onChange={(e) => setNewTemplateDesc(e.target.value)}
                          className="w-full px-6 py-4 bg-[#080808] border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-zinc-800"
                          placeholder="简述风格主题..."
                        />
                      </div>
                    </div>

                    {/* 标签管理 */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">模板归属标签</label>
                        <span className="text-[9px] text-zinc-600">选择标签以便用户分类查找</span>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {allTags?.map && allTags.map(tag => (
                          <button
                            key={tag.id}
                            onClick={() => {
                              setNewTemplateTags(prev =>
                                prev.includes(tag.id) ? prev.filter(t => t !== tag.id) : [...prev, tag.id]
                              );
                            }}
                            className={`px-5 py-3 rounded-2xl text-[10px] font-bold border transition-all active:scale-95 ${newTemplateTags.includes(tag.id)
                              ? 'text-white shadow-lg'
                              : 'bg-zinc-900/50 text-zinc-600 border-white/5 hover:border-white/20 hover:text-zinc-400'
                              }`}
                            style={newTemplateTags.includes(tag.id) ? { backgroundColor: tag.color, borderColor: tag.color } : {}}
                          >
                            {tag.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 默认渲染参数 - 性别 (精简版) */}
                    <div className="space-y-4 pt-6 border-t border-white/5">
                      <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">默认性别倾向</label>
                        <div className="flex p-1 bg-[#080808] rounded-2xl border border-white/5">
                          {(['female', 'male'] as const).map(gender => (
                            <button
                              key={gender}
                              onClick={() => setTemplateDefaultGender(gender)}
                              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${templateDefaultGender === gender
                                ? gender === 'female' ? 'bg-pink-600 text-white shadow-lg shadow-pink-900/20' : 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                                : 'text-zinc-600 hover:text-zinc-400'
                                }`}
                            >
                              {gender === 'female' ? 'WOMAN' : 'MAN'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 分组：提示词核心 */}
                    <div className="space-y-6 pt-6 border-t border-white/5">
                      <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <span className="text-sm">🪄</span>
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-white">智慧提示词核心</h4>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">原始创意描述 (Step 1)</label>
                            <span className="text-[9px] text-zinc-700">任何语言均可</span>
                          </div>
                          <textarea
                            value={newTemplatePrompt}
                            onChange={(e) => {
                              setNewTemplatePrompt(e.target.value);
                              setShowOptimizedPrompts(false);
                            }}
                            rows={4}
                            className="w-full px-6 py-5 bg-[#080808] border border-white/5 rounded-[2rem] text-white text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 resize-none transition-all placeholder:text-zinc-800"
                            placeholder="例如：在巴黎街头的雨中，撑着伞，霓虹灯倒影，高级胶片质感..."
                          />
                        </div>

                        <button
                          onClick={async () => {
                            if (!newTemplatePrompt.trim()) {
                              setError('请先输入提示词核心创意');
                              return;
                            }
                            setIsGenerating(true);
                            setShowOptimizedPrompts(false);
                            try {
                              const response = await fetch('/api/generate/optimize-prompt', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'Authorization': `Bearer ${localStorage.getItem('lyra_auth_token')}`
                                },
                                body: JSON.stringify({ prompt: newTemplatePrompt })
                              });
                              const data = await response.json();
                              if (!response.ok) throw new Error(data.error);

                              if (data.optimizedPrompt && typeof data.optimizedPrompt === 'object') {
                                const result = data.optimizedPrompt;
                                if (result.name && !editingTemplate) setNewTemplateName(result.name);
                                if (result.description && !editingTemplate) setNewTemplateDesc(result.description);
                                setOptimizedPrompts({ female: result.female || null, male: result.male || null });
                                setShowOptimizedPrompts(true);
                              } else if (data.optimizedPrompt) {
                                setOptimizedPrompts({ female: data.optimizedPrompt, male: null });
                                setShowOptimizedPrompts(true);
                              }
                            } catch (err: any) {
                              setError(err.message || 'AI 优化引擎连接失败');
                            } finally {
                              setIsGenerating(false);
                            }
                          }}
                          disabled={isGenerating}
                          className="w-full group relative py-6 rounded-[2.5rem] overflow-hidden bg-white hover:scale-[1.01] transition-all duration-500 disabled:opacity-50 active:scale-95 shadow-xl shadow-white/5"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          <span className={`relative z-10 text-[11px] font-black uppercase tracking-[0.2em] transition-colors duration-500 ${isGenerating ? 'text-zinc-400' : 'text-black group-hover:text-white'}`}>
                            {isGenerating ? 'AI 正在深度构建中...' : '✨ 唤醒 AI 自动生成全套预设 (Step 2)'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* AI 优化出的最终确认区 */}
                    {showOptimizedPrompts && (
                      <div className="space-y-8 p-10 bg-gradient-to-br from-[#0c0c14] to-[#080808] rounded-[3.5rem] border border-indigo-500/20 shadow-2xl animate-slide-up">
                        <div className="flex items-center gap-3 border-b border-indigo-500/10 pb-6">
                          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div className="space-y-1">
                            <h5 className="text-[11px] font-black uppercase tracking-widest text-green-400">AI 预设已生成</h5>
                            <p className="text-[9px] text-zinc-600 uppercase tracking-widest">请详细核对并将创意最终发布 (Step 3)</p>
                          </div>
                        </div>

                        <div className="space-y-8">
                          {/* 女性版本 */}
                          {optimizedPrompts.female && (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between px-2">
                                <label className="text-[10px] text-pink-500 uppercase tracking-widest font-black flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-pink-600"></span>
                                  女性场景渲染指令
                                </label>
                                <button onClick={() => setOptimizedPrompts(prev => ({ ...prev, female: null }))} className="text-[9px] text-zinc-700 hover:text-red-400 transition-colors uppercase font-black">丢弃</button>
                              </div>
                              <textarea
                                value={optimizedPrompts.female}
                                onChange={(e) => setOptimizedPrompts(prev => ({ ...prev, female: e.target.value }))}
                                rows={6}
                                className="w-full px-6 py-5 bg-[#050505] border border-pink-900/20 rounded-[2rem] text-zinc-300 text-xs focus:outline-none focus:border-pink-500/50 resize-none leading-relaxed"
                              />
                            </div>
                          )}

                          {/* 男性版本 */}
                          {optimizedPrompts.male && (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between px-2">
                                <label className="text-[10px] text-blue-500 uppercase tracking-widest font-black flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                                  男性场景渲染指令
                                </label>
                                <button onClick={() => setOptimizedPrompts(prev => ({ ...prev, male: null }))} className="text-[9px] text-zinc-700 hover:text-red-400 transition-colors uppercase font-black">丢弃</button>
                              </div>
                              <textarea
                                value={optimizedPrompts.male}
                                onChange={(e) => setOptimizedPrompts(prev => ({ ...prev, male: e.target.value }))}
                                rows={6}
                                className="w-full px-6 py-5 bg-[#050505] border border-blue-900/20 rounded-[2rem] text-zinc-300 text-xs focus:outline-none focus:border-blue-500/50 resize-none leading-relaxed"
                              />
                            </div>
                          )}
                        </div>

                        {/* 最终发布按钮 */}
                        <button
                          onClick={async () => {
                            if (!newTemplateImage) { setError('请先上传模板示例图'); return; }
                            if (!newTemplateName.trim()) { setError('请设置模板名称'); return; }
                            try {
                              const templateData = {
                                id: editingTemplate?.id || Date.now().toString(),
                                imageUrl: newTemplateImage,
                                name: newTemplateName,
                                description: newTemplateDesc || '',
                                prompt: '',
                                malePrompt: optimizedPrompts.male || null,
                                femalePrompt: optimizedPrompts.female || null,
                                defaultGender: templateDefaultGender,
                                tags: newTemplateTags,
                                variables: []
                              };

                              if (editingTemplate) {
                                await templateApi.update(editingTemplate.id, templateData);
                                alert('模板修改已同步');
                              } else {
                                await templateApi.create(templateData);
                                alert('新模板已全网发布');
                              }
                              await loadTemplates();
                              setEditingTemplate(null);
                              setNewTemplateImage(null);
                              setNewTemplateName('');
                              setNewTemplateDesc('');
                              setNewTemplatePrompt('');
                              setNewTemplateTags([]);
                              setOptimizedPrompts({ female: null, male: null });
                              setShowOptimizedPrompts(false);
                            } catch (err: any) {
                              setError(err.message || '发布操作失败');
                            }
                          }}
                          className={`w-full py-6 rounded-[2.5rem] text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-2xl transition-all duration-700 hover:scale-[1.02] active:scale-95 ${optimizedPrompts.female && optimizedPrompts.male
                            ? 'bg-gradient-to-r from-pink-600 via-indigo-600 to-blue-600 shadow-indigo-500/30'
                            : optimizedPrompts.female
                              ? 'bg-gradient-to-r from-pink-600 to-rose-600 shadow-pink-500/30'
                              : 'bg-gradient-to-r from-indigo-600 to-blue-600 shadow-blue-500/30'
                            }`}
                        >
                          {editingTemplate ? '💾 立即同步所有修改' : '🚀 确认并完成最终发布'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 已发布模板管理 */}
          {adminTab === 'templates' && (
            <div className="space-y-10 animate-fade-in">
              <div className="flex items-center justify-between border-b border-white/5 pb-6">
                <div className="space-y-1">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-white">已发布模板库 ({templates.length})</h3>
                  <p className="text-[9px] text-zinc-600 uppercase tracking-widest leading-relaxed">管理您的所有创意资产与渲染预设</p>
                </div>
                <div className="flex gap-4">
                  <div className="px-5 py-2.5 rounded-2xl bg-zinc-900 border border-white/5 text-[10px] text-zinc-500 font-black uppercase tracking-widest">
                    按时间排序
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {templates?.map && templates.map(t => (
                  <div key={t.id} className="glass-card group rounded-[3rem] overflow-hidden border border-white/5 hover:border-indigo-500/30 transition-all duration-700 shadow-2xl">
                    {/* 模板图片预览 */}
                    <div className="aspect-[3/4] relative overflow-hidden">
                      <img
                        src={getImageUrl(t.imageUrl)}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://placehold.co/600x800/101010/FFF?text=No+Image';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-700" />

                      {/* 卡片顶部状态 */}
                      <div className="absolute top-6 left-6 right-6 flex justify-between items-start opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-700 z-30">
                        <div className="flex gap-1.5 flex-wrap max-w-[70%]">
                          {t.tags?.map && t.tags.map(tagId => {
                            const tag = allTags.find(tt => tt.id === tagId);
                            return tag ? (
                              <span key={tagId} className="px-3 py-1 rounded-full text-[8px] font-black text-white shadow-xl backdrop-blur-md" style={{ backgroundColor: `${tag.color}cc` }}>
                                {tag.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTemplate(t.id);
                          }}
                          className="w-10 h-10 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all transform hover:rotate-12 pointer-events-auto"
                        >
                          🗑️
                        </button>
                      </div>

                      {/* 卡片底部详情 */}
                      <div className="absolute bottom-8 left-8 right-8 space-y-4">
                        <div className="space-y-1">
                          <h4 className="text-xl font-bold text-white tracking-tight">{t.name}</h4>
                          <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed font-medium">{t.description}</p>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2">
                          {(t as any).defaultGender && (
                            <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-xl ${(t as any).defaultGender === 'female' ? 'bg-pink-600/20 text-pink-400 border border-pink-500/20' : 'bg-blue-600/20 text-blue-400 border border-blue-500/20'}`}>
                              {(t as any).defaultGender === 'female' ? 'Woman' : 'Man'}
                            </span>
                          )}
                          {t.malePrompt && t.femalePrompt && (
                            <span className="px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest bg-green-600/20 text-green-400 border border-green-500/20 shadow-xl">
                              ✓ 双版本
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 悬浮编辑层 */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-700 backdrop-blur-[2px] pointer-events-none group-hover:pointer-events-auto">
                        <button
                          onClick={() => {
                            setEditingTemplate(t);
                            setNewTemplateImage(t.imageUrl);
                            setNewTemplateName(t.name);
                            setNewTemplateDesc(t.description);
                            setNewTemplateTags(t.tags);
                            setTemplateDefaultGender((t as any).defaultGender || 'female');
                            if (t.malePrompt || t.femalePrompt) {
                              setOptimizedPrompts({ male: t.malePrompt || null, female: t.femalePrompt || null });
                              setShowOptimizedPrompts(true);
                            } else {
                              setNewTemplatePrompt(t.prompt);
                            }
                            setAdminTab('create');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="px-10 py-4 rounded-full bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl hover:scale-110 active:scale-95 transition-all transform translate-y-10 group-hover:translate-y-0 duration-700"
                        >
                          立即进入编辑
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {templates.length === 0 && (
                <div className="py-20 text-center space-y-6 glass-card rounded-[3.5rem] border border-white/5 mx-auto max-w-lg">
                  <div className="w-20 h-20 rounded-full bg-zinc-900 mx-auto flex items-center justify-center border border-white/5">
                    <span className="text-3xl grayscale">🗄️</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-white text-sm font-bold">暂无已发布模板</p>
                    <p className="text-zinc-500 text-[10px] uppercase tracking-widest leading-relaxed">您的创意库正在等待第一个作品的加入</p>
                  </div>
                  <button onClick={() => setAdminTab('create')} className="px-8 py-3 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-widest">去发布新模板</button>
                </div>
              )}
            </div>
          )}

          {/* 标签管理 */}
          {adminTab === 'tags' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 animate-fade-in items-start">
              {/* 左侧：标签添加/编辑 */}
              <div className="xl:col-span-5 space-y-8 sticky top-10">
                <div className="glass-card rounded-[3.5rem] p-10 border border-white/5 space-y-10 shadow-2xl">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm">🏷️</span>
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-white">
                        {editingTag ? '重塑标签定义' : '构筑新分类标签'}
                      </h3>
                    </div>
                    <p className="text-[9px] text-zinc-600 uppercase tracking-widest pl-7">这决定了用户在探索页面时的视觉归类</p>
                  </div>

                  <div className="space-y-6 pt-6 border-t border-white/5">
                    <div className="space-y-4">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black px-1">标签显示名称</label>
                      <input
                        type="text"
                        value={editingTag ? editingTag.name : newTagName}
                        onChange={(e) => editingTag ? setEditingTag({ ...editingTag, name: e.target.value }) : setNewTagName(e.target.value)}
                        className="w-full px-6 py-4 bg-[#080808] border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-zinc-800"
                        placeholder="例如：米兰秋季、高奢、街头反叛"
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black px-1">赋予色彩灵魂</label>
                      <div className="flex gap-4">
                        <div className="relative group">
                          <input
                            type="color"
                            value={editingTag ? editingTag.color : newTagColor}
                            onChange={(e) => editingTag ? setEditingTag({ ...editingTag, color: e.target.value }) : setNewTagColor(e.target.value)}
                            className="w-20 h-20 rounded-[2rem] cursor-pointer border-4 border-[#080808] bg-transparent group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <div
                          className="flex-1 h-20 rounded-[2rem] flex items-center justify-center text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-xl animate-fade-in border border-white/10"
                          style={{ backgroundColor: editingTag ? editingTag.color : newTagColor }}
                        >
                          {editingTag ? editingTag.name || '命题预览' : newTagName || '命题预览'}
                        </div>
                      </div>
                      <div className="grid grid-cols-6 gap-2 pt-2">
                        {['#6366f1', '#ec4899', '#f97316', '#10b981', '#06b6d4', '#8b5cf6'].map(c => (
                          <button
                            key={c}
                            onClick={() => editingTag ? setEditingTag({ ...editingTag, color: c }) : setNewTagColor(c)}
                            className={`aspect-square rounded-full border-2 transition-all ${c === (editingTag ? editingTag.color : newTagColor) ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-110'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="pt-8 space-y-4">
                      {editingTag ? (
                        <div className="flex gap-3">
                          <button
                            onClick={async () => {
                              try {
                                await tagApi.update(editingTag.id, editingTag.name, editingTag.color);
                                await loadTags();
                                setEditingTag(null);
                                alert('标签定义已更新');
                              } catch (err: any) { setError(err.message || '更新失败'); }
                            }}
                            className="flex-1 py-5 rounded-[2rem] bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-900/40 hover:bg-indigo-500 transition-all active:scale-95"
                          >
                            同步修改
                          </button>
                          <button
                            onClick={() => { setEditingTag(null); setNewTagName(''); }}
                            className="px-8 py-5 rounded-[2rem] bg-zinc-900 border border-white/5 text-zinc-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all active:scale-95"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
                            if (!newTagName.trim()) { setError('请先赋名'); return; }
                            try {
                              await tagApi.create(newTagName, newTagColor);
                              await loadTags();
                              setNewTagName('');
                              alert('新分类标签已激活');
                            } catch (err: any) { setError(err.message || '创建失败'); }
                          }}
                          className="w-full py-5 rounded-[2rem] bg-white text-black text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-zinc-100 transition-all active:scale-95"
                        >
                          激活新分类
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 右侧：标签列表库 */}
              <div className="xl:col-span-7 space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-6">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-zinc-500 pl-2">全站分类图谱 ({allTags.length})</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allTags?.map && allTags.map(tag => (
                    <div
                      key={tag.id}
                      className="glass-card group p-6 rounded-[2.5rem] flex items-center justify-between border border-white/5 hover:border-white/20 transition-all duration-500 shadow-xl"
                    >
                      <div className="flex items-center gap-5">
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-xl transition-transform group-hover:rotate-6"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name.substring(0, 1).toUpperCase()}
                        </div>
                        <div className="space-y-1">
                          <span className="text-sm font-bold text-white tracking-tight">{tag.name}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }}></div>
                            <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">{tag.color}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditingTag(tag); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className="px-5 py-3 rounded-xl bg-zinc-900 border border-white/5 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                        >
                          编辑
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`确定要抹除标签"${tag.name}"吗？这将影响所有使用该标签的模板。`)) {
                              try {
                                await tagApi.delete(tag.id);
                                await loadTags();
                              } catch (err: any) { setError(err.message || '抹除失败'); }
                            }
                          }}
                          className="px-4 py-3 rounded-xl bg-red-900/10 text-red-500/50 hover:text-red-400 hover:bg-red-900/20 transition-all"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}

                  {allTags.length === 0 && (
                    <div className="col-span-full py-20 text-center glass-card rounded-[3.5rem] border border-white/5 border-dashed">
                      <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">目前还没有建立任何分类体系</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col lg:flex-row font-sans overflow-x-hidden">
      {/* 侧边导航 */}
      <aside className="hidden lg:flex flex-col w-72 bg-zinc-950 border-r border-white/5 h-screen sticky top-0 z-50">
        <div className="p-12 flex items-center gap-3">
          <div className="w-9 h-9 bg-white text-black rounded-xl font-serif font-black flex items-center justify-center text-2xl">L</div>
          <span className="font-black text-2xl font-serif italic text-white">Lyra</span>
        </div>
        <nav className="flex-1 px-8 py-4 space-y-2">
          <NavItem active={location.pathname === '/'} onClick={() => { navigate('/'); setMode(AppMode.DASHBOARD); }} icon={<IconCreative />} label="创作工坊" />
          <NavItem active={location.pathname === '/templates'} onClick={() => navigate('/templates')} icon={<IconPoster />} label="模板广场" />
          <NavItem active={location.pathname === '/gallery'} onClick={() => navigate('/gallery')} icon={<IconGallery />} label="作品集" />
          {currentUser?.role === 'admin' && (
            <div className="pt-20">
              <NavItem active={location.pathname === '/admin'} onClick={() => navigate('/admin')} icon={<IconSettings />} label="后台管理" />
            </div>
          )}
        </nav>
        {/* 用户状态区 */}
        <div className="p-8 border-t border-white/5">
          {currentUser ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{currentUser.username.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-bold truncate">{currentUser.username}</p>
                  <p className="text-zinc-600 text-[9px] uppercase tracking-widest font-black">
                    {currentUser.role === 'admin' ? 'Admin' : 'Member'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/settings')}
                  className="flex-1 px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-zinc-500 text-[10px] uppercase tracking-widest font-black hover:bg-zinc-800 hover:text-white transition-all"
                >
                  设置
                </button>
                <button
                  onClick={handleUserLogout}
                  className="flex-1 px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-zinc-500 text-[10px] uppercase tracking-widest font-black hover:bg-red-900/20 hover:text-red-400 transition-all"
                >
                  退出
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="w-full px-4 py-4 bg-white text-black rounded-xl text-[10px] uppercase tracking-widest font-black hover:bg-zinc-200 transition-all"
            >
              登录 / 注册
            </button>
          )}
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 flex flex-col min-h-screen pb-20 lg:pb-0">
        <div className="container mx-auto px-4 py-6 lg:px-20 lg:py-20">
          <Routes>
            <Route path="/login" element={
              <AuthPage
                onSuccess={(user) => {
                  setCurrentUser(user);
                  navigate('/');
                }}
                onLogin={handleUserLogin}
                onRegister={handleUserRegister}
              />
            } />
            <Route path="/settings" element={
              !currentUser ? (
                <div className="text-center py-20">
                  <p className="text-zinc-400 mb-6">请先登录</p>
                  <Button onClick={() => navigate('/login')} className="mx-auto rounded-2xl">
                    去登录
                  </Button>
                </div>
              ) : (
                <div className="max-w-md mx-auto space-y-12 animate-fade-in">
                  <div className="space-y-4 text-center">
                    <h2 className="text-4xl font-serif italic text-white">账户设置</h2>
                    <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-black">Account Settings</p>
                  </div>

                  {/* 生成设置 */}
                  <div className="ios-card p-8 space-y-6">
                    <div className="space-y-2">
                      <h3 className="text-[11px] text-white uppercase tracking-widest font-black">生成设置</h3>
                      <p className="text-zinc-600 text-[10px]">调整AI图片生成的相关参数</p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-sm text-white font-medium">最大并行数</p>
                          <p className="text-[10px] text-zinc-500">同时处理的任务数量，数值越大生成越快</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            onClick={() => setUserSettings(prev => ({ ...prev, maxConcurrency: n as 1 | 2 | 3 | 4 | 5 }))}
                            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${userSettings.maxConcurrency === n
                              ? 'bg-white text-black'
                              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-white/5'
                              }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-zinc-600 text-center">
                        当前设置: {userSettings.maxConcurrency} 个任务同时处理
                        {userSettings.maxConcurrency >= 4 && ' (高并发可能影响稳定性)'}
                      </p>
                    </div>
                  </div>

                  <div className="ios-card p-8 space-y-8">
                    <div className="space-y-2">
                      <h3 className="text-[11px] text-white uppercase tracking-widest font-black">修改密码</h3>
                      <p className="text-zinc-600 text-[10px]">定期更换密码有助于保护账户安全</p>
                    </div>

                    {currentUser.role === 'admin' && !currentUser.id ? (
                      <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-black py-4">
                        管理员账户请通过环境变量修改密码
                      </p>
                    ) : (
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">当前密码</label>
                          <input
                            type="password"
                            value={passwordChangeState.oldPassword}
                            onChange={(e) => setPasswordChangeState(s => ({ ...s, oldPassword: e.target.value, error: null }))}
                            className="w-full px-5 py-4 bg-zinc-900 border border-white/5 rounded-xl text-white text-sm focus:outline-none focus:border-white/20 transition-colors"
                            placeholder="请输入当前密码"
                          />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">新密码</label>
                          <input
                            type="password"
                            value={passwordChangeState.newPassword}
                            onChange={(e) => setPasswordChangeState(s => ({ ...s, newPassword: e.target.value, error: null }))}
                            className="w-full px-5 py-4 bg-zinc-900 border border-white/5 rounded-xl text-white text-sm focus:outline-none focus:border-white/20 transition-colors"
                            placeholder="请输入新密码（至少6位）"
                          />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">确认新密码</label>
                          <input
                            type="password"
                            value={passwordChangeState.confirmPassword}
                            onChange={(e) => setPasswordChangeState(s => ({ ...s, confirmPassword: e.target.value, error: null }))}
                            className="w-full px-5 py-4 bg-zinc-900 border border-white/5 rounded-xl text-white text-sm focus:outline-none focus:border-white/20 transition-colors"
                            placeholder="请再次输入新密码"
                          />
                        </div>

                        {passwordChangeState.error && (
                          <p className="text-red-500 text-[10px] uppercase tracking-widest font-black text-center">
                            {passwordChangeState.error}
                          </p>
                        )}

                        {passwordChangeState.success && (
                          <p className="text-green-500 text-[10px] uppercase tracking-widest font-black text-center">
                            密码修改成功
                          </p>
                        )}

                        <Button
                          onClick={handleChangePassword}
                          isLoading={passwordChangeState.loading}
                          className="w-full h-14 rounded-xl"
                        >
                          确认修改
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            } />
            <Route path="/templates" element={renderTemplateGallery()} />
            <Route path="/admin" element={renderAdmin()} />
            <Route path="/gallery" element={
              <div className="space-y-8 lg:space-y-12 animate-fade-in pb-20">
                <div className="space-y-2 lg:space-y-4 text-center max-w-xl mx-auto">
                  <h2 className="text-3xl lg:text-5xl font-serif italic text-white">作品集</h2>
                  <p className="text-zinc-500 text-[10px] lg:text-xs uppercase tracking-[0.2em] lg:tracking-[0.3em] font-black">Your Creative Gallery</p>

                  {/* 视图切换 - 所有登录用户都能看到 */}
                  <div className="flex justify-center mt-6 lg:mt-8">
                    <div className="inline-flex p-1 bg-zinc-900 rounded-xl lg:rounded-2xl border border-white/5 shadow-xl lg:shadow-2xl">
                      <button
                        onClick={() => setGalleryViewMode('mine')}
                        className={`px-4 lg:px-6 py-2 rounded-lg lg:rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-wider lg:tracking-widest transition-all ${galleryViewMode === 'mine' ? 'bg-white text-black shadow-lg scale-[1.02]' : 'text-zinc-500 hover:text-white'}`}
                      >
                        🔒 我的作品
                      </button>
                      <button
                        onClick={() => setGalleryViewMode('community')}
                        className={`px-4 lg:px-6 py-2 rounded-lg lg:rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-wider lg:tracking-widest transition-all ${galleryViewMode === 'community' ? 'bg-white text-black shadow-lg scale-[1.02]' : 'text-zinc-500 hover:text-white'}`}
                      >
                        🌐 社区作品
                      </button>
                    </div>
                  </div>
                </div>

                {/* 我的作品视图 */}
                {galleryViewMode === 'mine' && (
                  <>
                    {!currentUser ? (
                      <div className="ios-card p-16 text-center space-y-6">
                        <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-black">登录后查看您的作品</p>
                        <Button onClick={() => navigate('/login')} className="mx-auto rounded-2xl">
                          立即登录
                        </Button>
                      </div>
                    ) : userHistory.length === 0 ? (
                      <div className="ios-card p-16 text-center">
                        <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-black">暂无作品，开始创作吧</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-8">
                        {userHistory.map(img => (
                          <div key={img.id} className="group relative rounded-xl lg:rounded-[2rem] overflow-hidden border border-white/5 hover:border-white/20 transition-all duration-500 bg-zinc-900/50">
                            {/* 图片区域 */}
                            <div className="aspect-[3/4] relative">
                              <img src={getImageUrl(img.thumbnailUrl || img.url)} className="w-full h-full object-cover" />

                              {/* 公开状态标识 */}
                              <div className="absolute top-4 right-4">
                                {img.isPublic ? (
                                  <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-[9px] font-bold border border-green-500/30 backdrop-blur-sm">
                                    🌐 已公开
                                  </span>
                                ) : (
                                  <span className="px-3 py-1 rounded-full bg-zinc-800/80 text-zinc-400 text-[9px] font-bold border border-white/10 backdrop-blur-sm">
                                    🔒 私有
                                  </span>
                                )}
                              </div>

                              {/* 悬浮层 */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                              {/* 底部信息 */}
                              <div className="absolute bottom-4 left-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-black">{img.type}</p>
                                <p className="text-[9px] text-zinc-600 mt-1">{new Date(img.timestamp).toLocaleString()}</p>
                              </div>
                            </div>

                            {/* Prompt 展示区域 */}
                            {img.prompt && (
                              <div className="p-4 border-t border-white/5">
                                <button
                                  onClick={() => setExpandedPromptId(expandedPromptId === img.id ? null : img.id)}
                                  className="w-full text-left flex items-center justify-between"
                                >
                                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">📝 Prompt</span>
                                  <span className="text-zinc-600 text-xs">{expandedPromptId === img.id ? '▲' : '▼'}</span>
                                </button>
                                {expandedPromptId === img.id && (
                                  <p className="text-[10px] text-zinc-400 mt-2 leading-relaxed line-clamp-4 break-words">
                                    {img.prompt}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* 操作按钮 */}
                            <div className="p-4 pt-0 flex flex-wrap gap-2">
                              <button
                                onClick={() => handleDownload(getImageUrl(img.url)!, `lyra-${img.id}.png`)}
                                className="flex-1 py-2 rounded-xl bg-white text-black text-[10px] font-bold text-center hover:bg-zinc-200 transition-colors"
                              >
                                ⬇️ 下载
                              </button>
                              <button
                                onClick={() => handleShareImage(img.id, !img.isPublic)}
                                className={`flex-1 py-2 rounded-xl text-[10px] font-bold text-center transition-colors ${img.isPublic
                                  ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                                  : 'bg-green-600/20 text-green-400 border border-green-500/30 hover:bg-green-600/30'
                                  }`}
                              >
                                {img.isPublic ? '🔒 设为私有' : '🌐 分享到社区'}
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm('确定要删除这张图片吗？')) return;
                                  try {
                                    const res = await fetch(`/api/user/history/${img.id}`, {
                                      method: 'DELETE',
                                      headers: { 'Authorization': `Bearer ${localStorage.getItem('lyra_auth_token')}` }
                                    });
                                    if (res.ok) {
                                      setUserHistory(prev => prev.filter(h => h.id !== img.id));
                                    } else {
                                      alert('删除失败');
                                    }
                                  } catch (err) {
                                    alert('删除失败');
                                  }
                                }}
                                className="px-4 py-2 rounded-xl bg-red-900/50 text-red-300 text-[10px] font-bold hover:bg-red-900 transition-colors"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* 社区作品视图 */}
                {galleryViewMode === 'community' && (
                  <>
                    {publicGallery.length === 0 ? (
                      <div className="ios-card p-16 text-center">
                        <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-black">社区还没有公开作品</p>
                        <p className="text-zinc-700 text-[9px] mt-2">成为第一个分享作品的创作者吧!</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-8">
                        {publicGallery?.map && publicGallery.map(img => (
                          <div key={img.id} className="group relative rounded-xl lg:rounded-[2rem] overflow-hidden border border-white/5 hover:border-white/20 transition-all duration-500 bg-zinc-900/50">
                            {/* 图片区域 */}
                            <div className="aspect-[3/4] relative">
                              <img src={getImageUrl(img.thumbnailUrl || img.url)} className="w-full h-full object-cover" />

                              {/* 作者标识 */}
                              <div className="absolute top-4 left-4">
                                <span className="px-3 py-1 rounded-full bg-zinc-900/80 text-zinc-300 text-[9px] font-bold border border-white/10 backdrop-blur-sm">
                                  👤 {img.username || '匿名'}
                                </span>
                              </div>

                              {/* 悬浮层 */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                              {/* 底部信息 */}
                              <div className="absolute bottom-4 left-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-black">{img.type}</p>
                                <p className="text-[9px] text-zinc-600 mt-1">{new Date(img.timestamp).toLocaleString()}</p>
                              </div>
                            </div>

                            {/* Prompt 展示区域 */}
                            {img.prompt && (
                              <div className="p-4 border-t border-white/5">
                                <button
                                  onClick={() => setExpandedPromptId(expandedPromptId === img.id ? null : img.id)}
                                  className="w-full text-left flex items-center justify-between"
                                >
                                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">📝 Prompt</span>
                                  <span className="text-zinc-600 text-xs">{expandedPromptId === img.id ? '▲' : '▼'}</span>
                                </button>
                                {expandedPromptId === img.id && (
                                  <p className="text-[10px] text-zinc-400 mt-2 leading-relaxed line-clamp-4 break-words">
                                    {img.prompt}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* 操作按钮 */}
                            <div className="p-4 pt-0 flex gap-2">
                              <button
                                onClick={() => handleDownload(getImageUrl(img.url)!, `lyra-${img.id}.png`)}
                                className="flex-1 py-2 rounded-xl bg-white text-black text-[10px] font-bold text-center hover:bg-zinc-200 transition-colors"
                              >
                                ⬇️ 下载
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            } />
            <Route path="/" element={
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-16">
                <div className="xl:col-span-7">
                  <div className="aspect-[3/4] rounded-[3.5rem] overflow-hidden border border-white/5 bg-[#080808] flex items-center justify-center relative shadow-2xl">
                    {!imageBase64 ? (
                      <div className="max-w-2xl mx-auto text-center space-y-12 animate-fade-in py-20">
                        <div className="space-y-4">
                          <h1 className="text-5xl lg:text-7xl font-black font-serif italic text-white leading-tight">开始创作</h1>
                          <p className="text-zinc-500 text-sm">上传眼镜产品图，AI为您生成专业模特佩戴效果图</p>
                        </div>

                        <div
                          className="relative aspect-[4/3] max-w-lg mx-auto rounded-[2rem] border-2 border-dashed border-white/20 bg-zinc-900/30 flex flex-col items-center justify-center gap-6 cursor-pointer hover:border-white/40 hover:bg-zinc-900/50 transition-all group"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                            <IconUpload className="w-10 h-10 text-zinc-400 group-hover:text-white transition-colors" />
                          </div>
                          <div className="space-y-2">
                            <p className="text-lg font-bold text-white">点击上传眼镜图片</p>
                            <p className="text-[11px] text-zinc-500">支持 PNG、JPG、WEBP 格式</p>
                          </div>
                          <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/png,image/jpeg,image/jpg,image/webp"
                            onChange={handleFileChange}
                          />
                        </div>

                        <div className="flex flex-wrap justify-center gap-6 text-[10px] text-zinc-600 uppercase tracking-widest">
                          <span>✓ 清晰的眼镜主体</span>
                          <span>✓ 干净的背景</span>
                          <span>✓ 正面或侧面角度</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <img src={getImageUrl(generatedImage || previewUrl!)} className={`max-w-full max-h-full object-contain ${isGenerating ? 'opacity-30 blur-3xl grayscale transition-all duration-1000' : 'transition-all duration-700'}`} />
                        {isGenerating && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 bg-black/40 backdrop-blur-3xl px-12 text-center">
                            <div className="relative">
                              <div className="w-24 h-24 border-2 border-white/10 rounded-full"></div>
                              <div className="absolute inset-0 w-24 h-24 border-t-2 border-white rounded-full animate-spin"></div>
                            </div>
                            <p className="text-[12px] text-white uppercase tracking-[0.4em] font-black animate-pulse">正在执行物理锁定渲染...</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="xl:col-span-5">
                  {mode === AppMode.DASHBOARD && (
                    <div className="space-y-10">
                      <h2 className="text-6xl font-black italic font-serif text-white">开始创作</h2>
                      {!imageBase64 ? (
                        <div className="p-8 bg-zinc-900/50 border border-white/10 rounded-2xl text-center space-y-6">
                          <div className="w-16 h-16 mx-auto rounded-full bg-yellow-500/10 flex items-center justify-center">
                            <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-white mb-2">请先上传眼镜图片</h3>
                            <p className="text-sm text-zinc-400">请点击左侧的"上传眼镜 PNG/JPG"按钮上传您的眼镜产品图</p>
                          </div>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-8 py-4 bg-white text-black rounded-2xl font-bold hover:bg-zinc-200 transition-colors"
                          >
                            立即上传 (支持WEBP)
                          </button>
                        </div>
                      ) : (
                        <div className="grid gap-6">
                          <FeatureCard title="商业模特试戴" description="一键配置模特属性，支持物理光影锁定与折射追踪。" icon={<IconModel />} onClick={() => setMode(AppMode.MODEL_CONFIG)} />
                          <FeatureCard title="静物产品摄影" description="专业影棚布光，支持多角度与材质增强渲染。" icon={<IconCamera />} onClick={() => setMode(AppMode.PRODUCT_SHOT)} />
                          <FeatureCard title="从模板生成" description="套用高质量大师模板，一键获得品牌级视觉效果。" icon={<IconPoster />} onClick={() => navigate('/templates')} />
                        </div>
                      )}
                    </div>
                  )}
                  {mode === AppMode.MODEL_CONFIG && renderConfig()}
                  {mode === AppMode.PRODUCT_SHOT && renderProductShot()}
                  {mode === AppMode.RESULT && generatedImage && (
                    <div className="space-y-8 animate-fade-in">
                      <h2 className="text-5xl font-serif italic text-white">渲染完成</h2>

                      {/* 反馈区域 */}
                      {lastGeneratedImageId && currentUser && (
                        <div className="p-6 bg-zinc-900/50 rounded-2xl border border-white/5 space-y-4">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">生成效果如何？</p>
                          {!feedbackSubmitted ? (
                            <div className="flex gap-3">
                              <button
                                onClick={() => handleFeedback(1)}
                                className="flex-1 py-4 rounded-xl bg-green-900/30 border border-green-500/20 text-green-400 text-sm font-bold hover:bg-green-900/50 transition-all flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                </svg>
                                满意
                              </button>
                              <button
                                onClick={() => handleFeedback(-1)}
                                className="flex-1 py-4 rounded-xl bg-red-900/30 border border-red-500/20 text-red-400 text-sm font-bold hover:bg-red-900/50 transition-all flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                                </svg>
                                不满意
                              </button>
                            </div>
                          ) : (
                            <p className="text-center text-green-400 text-sm font-bold py-2">感谢您的反馈！</p>
                          )}
                        </div>
                      )}

                      <div className="space-y-4">
                        <Button onClick={() => {
                          const link = document.createElement('a');
                          link.href = generatedImage!;
                          link.download = `lyra-shoot.png`;
                          link.click();
                        }} className="w-full h-20 rounded-[2rem] bg-white text-black font-black text-sm">导出商业级原图</Button>
                        <Button variant="outline" onClick={() => { setMode(AppMode.DASHBOARD); setFeedbackSubmitted(false); setLastGeneratedImageId(null); }} className="w-full h-20 rounded-[2rem] text-sm">重新配置</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            } />
          </Routes>
        </div>
      </main>

      {/* 任务队列浮窗 */}
      {currentUser && (activeTasks.length > 0 || showTaskQueue) && (
        <div className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${showTaskQueue ? 'w-80' : 'w-auto'}`}>
          <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl">
            {/* 标题栏 */}
            <div
              className="p-4 flex items-center justify-between cursor-pointer bg-white/5 hover:bg-white/10 transition-colors"
              onClick={() => setShowTaskQueue(!showTaskQueue)}
            >
              <div className="flex items-center gap-3">
                {activeTasks.length > 0 ? (
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-zinc-500" />
                )}
                <span className="text-xs font-bold text-white">
                  任务队列 ({activeTasks.length})
                </span>
              </div>
              <div className={`transform transition-transform ${showTaskQueue ? 'rotate-180' : ''}`}>
                <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </div>
            </div>

            {/* 列表 */}
            {showTaskQueue && (
              <div className="max-h-64 overflow-y-auto p-2 space-y-2">
                {activeTasks.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 text-[10px]">
                    暂无活动任务
                  </div>
                ) : (
                  activeTasks.map(task => (
                    <div key={task.id} className="p-3 bg-black/40 rounded-xl flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        {task.status === 'processing' ? (
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : task.status === 'completed' ? (
                          <div className="text-green-500">✓</div>
                        ) : task.status === 'failed' ? (
                          <div className="text-red-500">!</div>
                        ) : (
                          <div className="text-zinc-500">...</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold text-zinc-300 truncate">
                          {task.type === 'batch' ? '批量生成任务' : 'AI 生成任务'}
                        </div>
                        <div className="text-[9px] text-zinc-500 flex justify-between">
                          <span>{task.status === 'pending' ? '排队中...' :
                            task.status === 'processing' ? '正在处理...' :
                              task.status === 'completed' ? '已完成' : '失败'}</span>
                          <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 移动端底部导航栏 */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur-xl border-t border-white/10 z-[100] safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-2">
          {/* 创作工坊 */}
          <button
            onClick={() => { navigate('/'); setMode(AppMode.DASHBOARD); }}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${location.pathname === '/' ? 'text-white' : 'text-zinc-500'
              }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.764m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
            </svg>
            <span className="text-[9px] font-bold">创作</span>
          </button>

          {/* 模板广场 */}
          <button
            onClick={() => navigate('/templates')}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${location.pathname === '/templates' ? 'text-white' : 'text-zinc-500'
              }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <span className="text-[9px] font-bold">模板</span>
          </button>

          {/* 作品集 */}
          <button
            onClick={() => navigate('/gallery')}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${location.pathname === '/gallery' ? 'text-white' : 'text-zinc-500'
              }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <span className="text-[9px] font-bold">作品</span>
          </button>

          {/* 用户/登录 */}
          <button
            onClick={() => currentUser ? navigate('/settings') : navigate('/login')}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${location.pathname === '/settings' || location.pathname === '/login' ? 'text-white' : 'text-zinc-500'
              }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            <span className="text-[9px] font-bold">{currentUser ? '我的' : '登录'}</span>
          </button>
        </div>
      </nav>

      {error && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 ios-glass px-10 py-6 rounded-3xl text-red-400 text-[10px] font-black z-[500] uppercase tracking-widest border-red-900/20">{error}</div>}
    </div>
  );
};

export default App;
