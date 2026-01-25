export interface User {
  id: number | null;
  username: string;
  role: 'user' | 'admin';
}

export interface AuthState {
  isLoggedIn: boolean;
  user: User | null;
  token: string | null;
}



export enum AppMode {
  DASHBOARD = 'DASHBOARD',
  MODEL_SHOT = 'MODEL_SHOT',
  MODEL_CONFIG = 'MODEL_CONFIG',
  POSTER_GENERATION = 'POSTER_GENERATION',
  PRESET_STYLES = 'PRESET_STYLES',
  RESULT = 'RESULT',
  ADMIN = 'ADMIN',
  PRODUCT_SHOT = 'PRODUCT_SHOT'
}

export enum NavTab {
  CREATE = 'CREATE',
  TEMPLATES = 'TEMPLATES',
  GALLERY = 'GALLERY',
  ADMIN = 'ADMIN'
}

export type ImageSize = '1K' | '2K' | '4K';
export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type FramingType = 'Close-up' | 'Bust Shot' | 'Upper Body' | 'Full Body';

export type EyewearType = 'Optical' | 'Sunglasses' | 'Sports' | 'Auto-detect';

export type CommercialStyle = 'E-commerce Main' | 'Brand Campaign' | 'Social Media' | 'Lookbook' | 'Advertising Poster';
export type ModelVibe = 'Calm & Intellectual' | 'Natural & Friendly' | 'High-Fashion Edge' | 'Athletic Energy' | 'Professional Executive';

export type CameraType = 'Hasselblad H6D' | 'Sony A7R V' | 'Fujifilm GFX 100II' | 'Leica M11';
export type LensType = '35mm f/1.4' | '50mm f/1.2' | '85mm f/1.4' | '100mm f/2.8 Macro' | '135mm f/1.8';
export type SkinTexture = 'High-Fidelity Realism' | 'Natural Commercial' | 'Soft Glow';

export type EthnicityType = 'East Asian' | 'Southeast Asian' | 'South Asian' | 'Caucasian' | 'Mediterranean' | 'Scandinavian' | 'African' | 'Hispanic/Latino' | 'Middle Eastern';

export type LightingType = 'Butterfly (Paramount)' | 'Rembrandt' | 'Rim Light' | 'Softbox Diffused' | 'Neon Noir' | 'Golden Hour';
export type MoodType = 'Cinematic Teal & Orange' | 'Classic Black & White' | 'High-Key Clean' | 'Low-Key Moody' | 'Vintage Film' | 'Natural Soft';

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  config: Partial<ModelConfig>;
}

// 模板变量定义
export interface TemplateVariable {
  key: string;          // 变量占位符，如 {{title}}
  label: string;        // 显示标签，如 "海报标题"
  type: 'text' | 'textarea' | 'select';  // 输入类型
  options?: string[];   // select 类型的选项
  defaultValue?: string;
  required?: boolean;
}

// 标签定义
export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface TemplateItem {
  id: string;
  imageUrl: string;
  thumbnailUrl?: string;
  name: string;
  description: string;
  prompt: string;                    // 核心提示词，可包含 {{variable}} 占位符（兼容旧版）
  malePrompt?: string;               // 男性版本提示词
  femalePrompt?: string;             // 女性版本提示词
  tags: string[];                    // 标签ID数组（支持多标签）
  variables: TemplateVariable[];     // 用户可填入的变量
  // 模板默认设置
  defaultGender?: 'male' | 'female';           // 默认性别
}

export interface GeneratedImage {
  id: string;
  url: string;
  thumbnailUrl?: string;
  type: string;
  timestamp: number;
  prompt?: string;
  isPublic?: boolean;
  username?: string; // 用于社区画廊显示作者
}

export interface PosterConfig {
  title: string;
  subtitle: string;
  layout: string;
  typography: string;
  integration: string;
  material: string;
  tone: string;
  includeModel: boolean;
  camera: CameraType;
  lens: LensType;
  lighting: LightingType;
  mood: MoodType;
}

export interface ModelConfig {
  eyewearType: EyewearType;
  visualPurpose: CommercialStyle;
  modelVibe: ModelVibe;
  ethnicity: EthnicityType;
  gender: 'Female' | 'Male' | 'Non-binary';
  age: 'Child' | 'Teenager' | 'Youth' | 'Adult' | 'Mature';
  scene: string;
  framing: FramingType;
  camera: CameraType;
  lens: LensType;
  skinTexture: SkinTexture;
  lighting: LightingType;
  mood: MoodType;
  aspectRatio: AspectRatio;
}

// 预定义的模特变量选项（用于模板系统）
export const PREDEFINED_MODEL_VARIABLES: Record<string, TemplateVariable> = {
  gender: {
    key: '{{gender}}',
    label: '模特性别',
    type: 'select',
    options: ['女性', '男性'],
    defaultValue: '女性',
    required: false
  },
  ethnicity: {
    key: '{{ethnicity}}',
    label: '模特族裔',
    type: 'select',
    options: ['东亚人', '东南亚人', '南亚人', '欧裔', '非裔', '拉丁裔', '中东裔'],
    defaultValue: '东亚人',
    required: false
  },
  age: {
    key: '{{age}}',
    label: '年龄段',
    type: 'select',
    options: ['小孩', '青少年', '青年', '成年', '成熟'],
    defaultValue: '成年',
    required: false
  }
};

// 扩展变量选项
export const EXTENDED_VARIABLES = {
  expression: {
    label: '表情',
    labelEn: 'Expression',
    options: [
      { zh: '微笑', en: 'gentle smile' },
      { zh: '自信', en: 'confident' },
      { zh: '严肃', en: 'serious' },
      { zh: '沉思', en: 'thoughtful' },
      { zh: '自然', en: 'natural relaxed' }
    ],
    default: '自然'
  },
  pose: {
    label: '视角',
    labelEn: 'Pose/Angle',
    options: [
      { zh: '正面', en: 'frontal view' },
      { zh: '3/4侧面', en: '3/4 view' },
      { zh: '侧面', en: 'profile view' },
      { zh: '微仰头', en: 'slight upward tilt' }
    ],
    default: '正面'
  },
  hairStyle: {
    label: '发型',
    labelEn: 'Hair Style',
    options: [
      { zh: '长发', en: 'long hair' },
      { zh: '短发', en: 'short hair' },
      { zh: '马尾', en: 'ponytail' },
      { zh: '盘发', en: 'hair bun' },
      { zh: '自然', en: 'natural hair' }
    ],
    default: '自然'
  },
  clothingStyle: {
    label: '服装色系',
    labelEn: 'Clothing Color',
    options: [
      { zh: '中性色', en: 'neutral tones clothing' },
      { zh: '暖色系', en: 'warm colored clothing' },
      { zh: '冷色系', en: 'cool colored clothing' },
      { zh: '黑白', en: 'black and white clothing' },
      { zh: '鲜艳色彩', en: 'vibrant colored clothing' }
    ],
    default: '中性色'
  }
};

// 提示词历史记录
export interface PromptHistoryItem {
  id: number;
  templateId: string | null;
  prompt: string;
  variables: Record<string, string>;
  isSuccessful: boolean;
  timestamp: number;
}

// 收藏的模板（带收藏时间）
export interface FavoriteTemplate extends TemplateItem {
  favoritedAt: number;
}

// 图片反馈
export interface ImageFeedback {
  likes: number;
  dislikes: number;
  userRating: -1 | 0 | 1; // -1=dislike, 0=no rating, 1=like
}

// 批量生成配置
export interface BatchGenerateConfig {
  templateId: string;
  prompt: string;
  combinations: Array<{
    ethnicity: string;
    age: string;
    expression?: string;
    pose?: string;
  }>;
  aspectRatio: string;
}

// 产品图角度类型
export type ProductAngle = 'front' | 'front_45_left' | 'front_45_right' | 'side_left' | 'side_right' | 'top' | 'perspective';

// 产品图背景颜色
export type ProductBackground =
  | 'pure_white'      // 纯白
  | 'light_gray'      // 浅灰
  | 'warm_beige'      // 暖米色
  | 'light_blue'      // 浅蓝
  | 'black'           // 纯黑
  | 'gradient_gray';  // 灰色渐变

// 产品图配置
export interface ProductShotConfig {
  angles: ProductAngle[];
  backgroundColor: ProductBackground;
  reflectionEnabled: boolean;
  shadowStyle: 'none' | 'soft' | 'dramatic';
  outputSize: '1K' | '2K' | '4K';
  aspectRatio: '1:1' | '4:3' | '3:4';
}

// 全局用户设置
export interface UserSettings {
  maxConcurrency: 1 | 2 | 3 | 4 | 5;  // 全局并行处理数量
}

// 产品图生成结果
export interface ProductShotResult {
  angle: ProductAngle;
  imageUrl: string;
  thumbnailUrl?: string;
  imageId: string;
}

// 批次进度类型
export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  pending: number;
}

// 产品图批次响应
export interface ProductShotBatchResponse {
  success: boolean;
  batchId: string;
  taskIds: string[];
  totalImages: number;
  message: string;
}

// 产品图批次状态
export interface ProductShotBatchStatus {
  success: boolean;
  batchId: string;
  progress: BatchProgress;
  tasks: Array<{
    id: string;
    angle: string;
    status: string;
    errorMessage?: string;
  }>;
  results: ProductShotResult[];
  isCompleted: boolean;
}

// 提示词模块
export interface PromptModule {
  id: string;
  type: 'model' | 'scene' | 'photography';
  name: string;
  content: string;
}

// 模块化提示词结构
export interface ModularPrompt {
  eyewear: string;      // 眼镜保真声明（固定）
  model: string;        // 模特描述
  styling: string;      // 服装造型
  scene: string;        // 场景环境
  photography: string;  // 摄影参数
}
