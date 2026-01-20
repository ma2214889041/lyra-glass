
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  AppMode, NavTab, ImageSize, AspectRatio, PosterConfig,
  GeneratedImage, ModelConfig, EyewearType,
  EthnicityType, LightingType, FramingType, CommercialStyle, ModelVibe,
  CameraType, LensType, SkinTexture, MoodType, StylePreset, TemplateItem, User,
  Tag, TemplateVariable, PREDEFINED_MODEL_VARIABLES, EXTENDED_VARIABLES,
  PromptHistoryItem, FavoriteTemplate
} from './types';
import { authApi, templateApi, generateApi, userApi, tagApi, feedbackApi, batchApi, taskApi } from './services/api';
import { Button } from './components/Button';
import { FeatureCard } from './components/FeatureCard';
import { IconCamera, IconUpload, IconModel, IconCreative, IconPoster, IconGallery } from './components/Icons';
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

  // 用户认证状态
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  // 管理员表单状态
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [newTemplateImage, setNewTemplateImage] = useState<string | null>(null);

  // 新模板表单状态
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [newTemplatePrompt, setNewTemplatePrompt] = useState('');
  const [newTemplateTags, setNewTemplateTags] = useState<string[]>([]);
  const [newTemplateVariables, setNewTemplateVariables] = useState<TemplateVariable[]>([]);

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
  }
  const [activeTasks, setActiveTasks] = useState<TaskItem[]>([]);
  const [showTaskQueue, setShowTaskQueue] = useState(false);
  const [taskPollingEnabled, setTaskPollingEnabled] = useState(true);

  // 中英文映射（用于生成英文prompt）
  const ethnicityToEnglish: Record<string, string> = {
    '东亚人': 'East Asian',
    '东南亚人': 'Southeast Asian',
    '南亚人': 'South Asian',
    '欧裔': 'Caucasian',
    '非裔': 'African',
    '拉丁裔': 'Hispanic/Latino',
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

    let prompt = template.prompt
      .replace(/\{\{ethnicity\}\}/g, ethnicity)
      .replace(/\{\{age\}\}/g, age);

    // 如果开启扩展变量，添加到模特描述中
    if (includeExtended) {
      const expression = expressionToEnglish[userExpression] || userExpression;
      const pose = poseToEnglish[userPose] || userPose;
      const hairStyle = hairStyleToEnglish[userHairStyle] || userHairStyle;
      const clothingStyle = clothingStyleToEnglish[userClothingStyle] || userClothingStyle;

      // 在 [MODEL] 部分后添加扩展属性
      prompt = prompt.replace(
        /(\[MODEL\][^\[]*)/,
        `$1\nExpression: ${expression}, Pose: ${pose}, Hair: ${hairStyle}\n`
      );
      // 在 [STYLING] 部分添加服装色系
      prompt = prompt.replace(
        /(\[STYLING\][^\[]*)/,
        `$1\nClothing color palette: ${clothingStyle}\n`
      );
    }

    return prompt;
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
      setFavorites(new Set(favs.map(f => f.id)));
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
    const ethnicities = ['东亚人', '欧裔', '非裔'];
    const ages = ['青年', '成年'];
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
  }, [currentUser, loadUserHistory, loadFavorites, loadPromptHistory]);

  // 任务轮询：定期检查活跃任务状态
  useEffect(() => {
    if (!currentUser || !taskPollingEnabled) return;

    const pollTasks = async () => {
      try {
        const { tasks } = await taskApi.getTasks(true);  // 只获取活跃任务
        setActiveTasks(tasks as TaskItem[]);

        // 如果有任务完成，刷新历史记录
        const hasCompleted = tasks.some((t: any) => t.status === 'completed');
        if (hasCompleted) {
          loadUserHistory();
        }
      } catch (err) {
        console.error('任务轮询失败:', err);
      }
    };

    // 立即执行一次
    pollTasks();

    // 每5秒轮询一次
    const interval = setInterval(pollTasks, 5000);
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
  const handleGenerateWithPrompt = async (customPrompt: string, aspectRatio?: string) => {
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
    setError(null);
    navigate('/');
    setMode(AppMode.RESULT);

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
      <div className="space-y-12 animate-fade-in pb-20">
        <div className="space-y-4 text-center max-w-xl mx-auto">
          <h2 className="text-5xl font-serif italic text-white">模板广场</h2>
          <p className="text-zinc-500 text-xs uppercase tracking-[0.3em] font-black">Curated Masterpiece Library</p>
        </div>

        {/* 标签筛选栏 */}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => setFilterTag(null)}
            className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${!filterTag ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-500 border border-white/5 hover:border-white/20'}`}
          >
            全部
          </button>
          {allTags.map(tag => (
            <button
              key={tag.id}
              onClick={() => setFilterTag(tag.id)}
              className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${filterTag === tag.id ? 'text-white' : 'bg-zinc-900 text-zinc-500 border border-white/5 hover:border-white/20'}`}
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
          {filteredTemplates.map(tpl => (
            <div
              key={tpl.id}
              onClick={() => {
                setSelectedTemplate(tpl);
                setEditablePrompt(tpl.prompt);
                setShowTemplateDetail(true);
              }}
              className="group relative aspect-[3/4] rounded-[3rem] overflow-hidden cursor-pointer border border-white/5 hover:border-white/20 transition-all duration-700 hover:scale-[1.02] shadow-2xl"
            >
              <img src={tpl.imageUrl} className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all duration-700" />
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
              <div className="absolute bottom-10 left-10 right-10 space-y-3 translate-y-4 group-hover:translate-y-0 transition-all duration-700">
                <h3 className="text-2xl font-serif italic text-white">{tpl.name}</h3>
                <p className="text-zinc-400 text-[10px] uppercase tracking-widest font-bold line-clamp-1">{tpl.description}</p>
                <div className="pt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="px-5 py-2 rounded-full bg-white text-black text-[9px] font-black uppercase tracking-widest">查看详情</span>
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
                <img src={selectedTemplate.imageUrl} className="w-28 h-36 object-cover rounded-2xl flex-shrink-0" />
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

              {/* 模式切换标签 */}
              <div className="flex bg-zinc-800/50 p-1 rounded-xl">
                <button
                  onClick={() => { setIsBatchMode(false); setIsEditMode(false); }}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${!isBatchMode && !isEditMode ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                >
                  单张生成
                </button>
                <button
                  onClick={() => { setIsBatchMode(true); setIsEditMode(false); initBatchCombinations(); }}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${isBatchMode ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                >
                  批量生成
                </button>
                <button
                  onClick={() => { setIsEditMode(true); setIsBatchMode(false); setEditedPrompt(getFullPrompt(selectedTemplate)); }}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${isEditMode ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                >
                  编辑提示词
                </button>
              </div>

              {/* 批量生成模式 */}
              {isBatchMode && (
                <div className="space-y-4 p-4 bg-blue-900/20 border border-blue-500/20 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-blue-400 uppercase tracking-widest font-black">选择组合 (最多5个)</label>
                    <span className="text-[10px] text-zinc-500">
                      已选 {batchCombinations.filter(c => c.selected).length}/5
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {batchCombinations.map((combo, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          const selected = batchCombinations.filter(c => c.selected).length;
                          if (!combo.selected && selected >= 5) return;
                          setBatchCombinations(prev => prev.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c));
                        }}
                        className={`p-3 rounded-xl text-left transition-all ${combo.selected ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                      >
                        <p className="text-[10px] font-bold">{combo.ethnicity}</p>
                        <p className="text-[9px] opacity-70">{combo.age}</p>
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={handleBatchGenerate}
                    isLoading={isBatchGenerating}
                    className="w-full h-12 rounded-xl bg-blue-600 text-white text-[10px] font-black"
                  >
                    {isBatchGenerating ? '批量生成中...' : `批量生成 ${batchCombinations.filter(c => c.selected).length} 张`}
                  </Button>
                  {batchResults.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-4">
                      {batchResults.map((r, i) => (
                        <img key={i} src={r.imageUrl} className="w-full aspect-[3/4] object-cover rounded-xl" />
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                          <option value="东亚人">东亚人</option>
                          <option value="东南亚人">东南亚人</option>
                          <option value="南亚人">南亚人</option>
                          <option value="欧裔">欧裔</option>
                          <option value="非裔">非裔</option>
                          <option value="拉丁裔">拉丁裔</option>
                          <option value="中东裔">中东裔</option>
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

                  {/* 扩展模特选项 */}
                  <details className="group">
                    <summary className="text-[10px] text-zinc-500 uppercase tracking-widest font-black cursor-pointer hover:text-zinc-400 flex items-center gap-2">
                      <span>高级选项</span>
                      <svg className="w-3 h-3 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </summary>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-zinc-400 font-bold">表情</label>
                        <select value={userExpression} onChange={(e) => setUserExpression(e.target.value)} className="w-full px-3 py-2.5 bg-zinc-800 border border-white/5 rounded-xl text-white text-xs focus:outline-none focus:border-white/20">
                          {EXTENDED_VARIABLES.expression.options.map(opt => (
                            <option key={opt.zh} value={opt.zh}>{opt.zh}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-zinc-400 font-bold">视角</label>
                        <select value={userPose} onChange={(e) => setUserPose(e.target.value)} className="w-full px-3 py-2.5 bg-zinc-800 border border-white/5 rounded-xl text-white text-xs focus:outline-none focus:border-white/20">
                          {EXTENDED_VARIABLES.pose.options.map(opt => (
                            <option key={opt.zh} value={opt.zh}>{opt.zh}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-zinc-400 font-bold">发型</label>
                        <select value={userHairStyle} onChange={(e) => setUserHairStyle(e.target.value)} className="w-full px-3 py-2.5 bg-zinc-800 border border-white/5 rounded-xl text-white text-xs focus:outline-none focus:border-white/20">
                          {EXTENDED_VARIABLES.hairStyle.options.map(opt => (
                            <option key={opt.zh} value={opt.zh}>{opt.zh}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-zinc-400 font-bold">服装色系</label>
                        <select value={userClothingStyle} onChange={(e) => setUserClothingStyle(e.target.value)} className="w-full px-3 py-2.5 bg-zinc-800 border border-white/5 rounded-xl text-white text-xs focus:outline-none focus:border-white/20">
                          {EXTENDED_VARIABLES.clothingStyle.options.map(opt => (
                            <option key={opt.zh} value={opt.zh}>{opt.zh}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </details>

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
                        handleGenerateWithPrompt(finalPrompt, userAspectRatio);
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
      <div className="max-w-4xl mx-auto space-y-12 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="space-y-4">
            <h2 className="text-5xl font-serif italic text-white">管理员后台</h2>
            <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-black">Template & Prompt Management</p>
          </div>
          <button
            onClick={handleAdminLogout}
            className="px-6 py-3 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 text-[10px] uppercase tracking-widest font-black hover:bg-red-900/20 hover:text-red-400 hover:border-red-900/30 transition-all"
          >
            退出登录
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* 左列：图片上传 */}
          <div className="space-y-6">
            <div
              onClick={() => adminFileInputRef.current?.click()}
              className="aspect-[3/4] rounded-[2.5rem] bg-zinc-900 border border-dashed border-white/10 flex items-center justify-center cursor-pointer overflow-hidden"
            >
              {newTemplateImage ? (
                <img src={newTemplateImage} className="w-full h-full object-cover" />
              ) : (
                <span className="text-zinc-500 font-bold uppercase tracking-widest text-[9px]">点击上传效果示例图</span>
              )}
              <input type="file" ref={adminFileInputRef} className="hidden" onChange={async (e) => {
                if (e.target.files?.[0]) setNewTemplateImage(`data:image/jpeg;base64,${await convertBlobToBase64(e.target.files[0])}`);
              }} />
            </div>
          </div>

          {/* 右列：表单 */}
          <div className="space-y-6">
            <div className="p-8 ios-card space-y-6">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">模板信息</h4>

              {/* 模板名称 */}
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">模板名称</label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-white text-sm focus:outline-none focus:border-white/20"
                  placeholder="例如：都市精英风格"
                />
              </div>

              {/* 标签（多选） */}
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">标签（可多选）</label>
                <div className="flex flex-wrap gap-2">
                  {allTags.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => {
                        setNewTemplateTags(prev =>
                          prev.includes(tag.id)
                            ? prev.filter(t => t !== tag.id)
                            : [...prev, tag.id]
                        );
                      }}
                      className={`px-4 py-2 rounded-xl text-[10px] font-bold border transition-all ${newTemplateTags.includes(tag.id) ? 'text-white border-white' : 'bg-zinc-900 text-zinc-500 border-white/5 hover:border-white/20'}`}
                      style={newTemplateTags.includes(tag.id) ? { backgroundColor: tag.color, borderColor: tag.color } : {}}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 描述 */}
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">描述</label>
                <input
                  type="text"
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-white text-sm focus:outline-none focus:border-white/20"
                  placeholder="简短描述此模板风格"
                />
              </div>

              {/* 原始提示词输入 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                    原始提示词 <span className="text-zinc-700">(粘贴后点击AI优化生成男女两个版本)</span>
                  </label>
                  <button
                    onClick={async () => {
                      if (!newTemplatePrompt.trim()) {
                        setError('请先输入提示词');
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
                        // 新格式返回 { female, male }
                        if (data.optimizedPrompt && typeof data.optimizedPrompt === 'object') {
                          setOptimizedPrompts(data.optimizedPrompt);
                          setShowOptimizedPrompts(true);
                        } else if (data.optimizedPrompt) {
                          // 兼容旧格式
                          setOptimizedPrompts({ female: data.optimizedPrompt, male: null });
                          setShowOptimizedPrompts(true);
                        }
                      } catch (err: any) {
                        setError(err.message || 'AI优化失败');
                      } finally {
                        setIsGenerating(false);
                      }
                    }}
                    disabled={isGenerating}
                    className="px-4 py-2 rounded-xl text-[10px] font-bold bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:opacity-80 transition-opacity disabled:opacity-50"
                  >
                    {isGenerating ? '生成中...' : '✨ AI 生成男女版本'}
                  </button>
                </div>
                <textarea
                  value={newTemplatePrompt}
                  onChange={(e) => {
                    setNewTemplatePrompt(e.target.value);
                    setShowOptimizedPrompts(false);
                  }}
                  rows={4}
                  className="w-full px-4 py-3 bg-zinc-900 border border-white/5 rounded-xl text-white text-sm focus:outline-none focus:border-white/20 resize-none"
                  placeholder="粘贴你的原始prompt，AI会自动生成男女两个版本..."
                />
              </div>

              {/* AI生成的男女版本 */}
              {showOptimizedPrompts && (
                <div className="space-y-4 p-4 bg-zinc-800/50 rounded-2xl border border-white/5">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-green-400">✓ AI 已生成两个版本</h5>

                  {/* 女性版本 */}
                  {optimizedPrompts.female && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-pink-400 uppercase tracking-widest font-black">👩 女性版本</label>
                        <button
                          onClick={async () => {
                            if (!newTemplateImage) {
                              setError('请先上传图片');
                              return;
                            }
                            try {
                              const newTpl: TemplateItem = {
                                id: Date.now().toString() + '_female',
                                imageUrl: newTemplateImage,
                                name: (newTemplateName || '新模板') + ' (女)',
                                description: newTemplateDesc || '',
                                prompt: optimizedPrompts.female!,
                                tags: newTemplateTags,
                                variables: []
                              };
                              await templateApi.create(newTpl);
                              await loadTemplates();
                              alert('女性版本已发布');
                            } catch (err: any) {
                              setError(err.message || '发布失败');
                            }
                          }}
                          className="px-3 py-1 rounded-lg text-[9px] font-bold bg-pink-600 text-white hover:bg-pink-500"
                        >
                          发布女性版本
                        </button>
                      </div>
                      <textarea
                        value={optimizedPrompts.female}
                        onChange={(e) => setOptimizedPrompts(prev => ({ ...prev, female: e.target.value }))}
                        rows={5}
                        className="w-full px-3 py-2 bg-zinc-900 border border-pink-900/30 rounded-xl text-white text-xs focus:outline-none focus:border-pink-500/50 resize-none"
                      />
                    </div>
                  )}

                  {/* 男性版本 */}
                  {optimizedPrompts.male && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-blue-400 uppercase tracking-widest font-black">👨 男性版本</label>
                        <button
                          onClick={async () => {
                            if (!newTemplateImage) {
                              setError('请先上传图片');
                              return;
                            }
                            try {
                              const newTpl: TemplateItem = {
                                id: Date.now().toString() + '_male',
                                imageUrl: newTemplateImage,
                                name: (newTemplateName || '新模板') + ' (男)',
                                description: newTemplateDesc || '',
                                prompt: optimizedPrompts.male!,
                                tags: newTemplateTags,
                                variables: []
                              };
                              await templateApi.create(newTpl);
                              await loadTemplates();
                              alert('男性版本已发布');
                            } catch (err: any) {
                              setError(err.message || '发布失败');
                            }
                          }}
                          className="px-3 py-1 rounded-lg text-[9px] font-bold bg-blue-600 text-white hover:bg-blue-500"
                        >
                          发布男性版本
                        </button>
                      </div>
                      <textarea
                        value={optimizedPrompts.male}
                        onChange={(e) => setOptimizedPrompts(prev => ({ ...prev, male: e.target.value }))}
                        rows={5}
                        className="w-full px-3 py-2 bg-zinc-900 border border-blue-900/30 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500/50 resize-none"
                      />
                    </div>
                  )}

                  {/* 同时发布两个版本 */}
                  {optimizedPrompts.female && optimizedPrompts.male && (
                    <button
                      onClick={async () => {
                        if (!newTemplateImage) {
                          setError('请先上传图片');
                          return;
                        }
                        try {
                          // 发布女性版本
                          await templateApi.create({
                            id: Date.now().toString() + '_female',
                            imageUrl: newTemplateImage,
                            name: (newTemplateName || '新模板') + ' (女)',
                            description: newTemplateDesc || '',
                            prompt: optimizedPrompts.female!,
                            tags: newTemplateTags,
                            variables: []
                          });
                          // 发布男性版本
                          await templateApi.create({
                            id: (Date.now() + 1).toString() + '_male',
                            imageUrl: newTemplateImage,
                            name: (newTemplateName || '新模板') + ' (男)',
                            description: newTemplateDesc || '',
                            prompt: optimizedPrompts.male!,
                            tags: newTemplateTags,
                            variables: []
                          });
                          await loadTemplates();
                          // 重置表单
                          setNewTemplateImage(null);
                          setNewTemplateName('');
                          setNewTemplateDesc('');
                          setNewTemplatePrompt('');
                          setNewTemplateTags([]);
                          setOptimizedPrompts({ female: null, male: null });
                          setShowOptimizedPrompts(false);
                          alert('两个版本都已发布');
                        } catch (err: any) {
                          setError(err.message || '发布失败');
                        }
                      }}
                      className="w-full py-3 rounded-xl text-[10px] font-bold bg-gradient-to-r from-pink-600 to-blue-600 text-white hover:opacity-90"
                    >
                      同时发布男女两个版本
                    </button>
                  )}
                </div>
              )}
            </div>

            <Button onClick={handleAdminAddTemplate} className="w-full h-16 rounded-2xl">发布至模板广场</Button>

            {/* 已上传列表 */}
            <div className="space-y-4 pt-6">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">已上传列表</h4>
              <div className="space-y-3">
                {templates.map(t => (
                  <div key={t.id} className="p-4 bg-zinc-900/50 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <img src={t.imageUrl} className="w-10 h-10 rounded-lg object-cover" />
                      <div>
                        <span className="text-xs font-bold text-zinc-300">{t.name}</span>
                        <span className="ml-2 text-[9px] text-zinc-600 uppercase">{t.category}</span>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteTemplate(t.id)} className="text-red-900 text-[10px] font-black uppercase hover:text-red-500 transition-colors">删除</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
      <main className="flex-1 flex flex-col min-h-screen">
        <div className="container mx-auto px-6 py-12 lg:px-20 lg:py-20">
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
              <div className="space-y-12 animate-fade-in pb-20">
                <div className="space-y-4 text-center max-w-xl mx-auto">
                  <h2 className="text-5xl font-serif italic text-white">作品集</h2>
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.3em] font-black">Your Creative Gallery</p>
                </div>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {userHistory.map(img => (
                      <div key={img.id} className="group relative aspect-[3/4] rounded-[2rem] overflow-hidden border border-white/5 hover:border-white/20 transition-all duration-500">
                        <img src={img.url} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute bottom-6 left-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-black">{img.type}</p>
                          <p className="text-[9px] text-zinc-600 mt-1">{new Date(img.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            } />
            <Route path="/" element={
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-16">
                <div className="xl:col-span-7">
                  <div className="aspect-[3/4] rounded-[3.5rem] overflow-hidden border border-white/5 bg-[#080808] flex items-center justify-center relative shadow-2xl">
                    {!imageBase64 ? (
                      <div className="p-12 text-center space-y-12 animate-fade-in">
                        <h1 className="text-7xl font-black font-serif italic text-white leading-tight tracking-tight">上传您的资产</h1>
                        <div className="flex flex-col gap-4 max-w-xs mx-auto">
                          <Button onClick={() => fileInputRef.current?.click()} className="rounded-3xl h-20 text-sm"><IconUpload /> <span className="ml-3">上传眼镜 PNG/JPG</span></Button>
                          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                          <p className="text-zinc-600 text-[9px] uppercase tracking-widest">请确保眼镜主体清晰，背景尽可能纯净</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <img src={generatedImage || previewUrl!} className={`max-w-full max-h-full object-contain ${isGenerating ? 'opacity-30 blur-3xl grayscale transition-all duration-1000' : 'transition-all duration-700'}`} />
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
                      <div className="grid gap-6">
                        <FeatureCard title="商业模特试戴" description="一键配置模特属性，支持物理光影锁定与折射追踪。" icon={<IconModel />} onClick={() => setMode(AppMode.MODEL_CONFIG)} />
                        <FeatureCard title="从模板生成" description="套用高质量大师模板，一键获得品牌级视觉效果。" icon={<IconPoster />} onClick={() => navigate('/templates')} />
                      </div>
                    </div>
                  )}
                  {mode === AppMode.MODEL_CONFIG && renderConfig()}
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

      {error && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 ios-glass px-10 py-6 rounded-3xl text-red-400 text-[10px] font-black z-[500] uppercase tracking-widest border-red-900/20">{error}</div>}
    </div>
  );
};

// 辅助图标
const IconSettings = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
);

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
      {options.map((opt: string) => (
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

export default App;
