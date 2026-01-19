
export enum AppMode {
  DASHBOARD = 'DASHBOARD',
  MODEL_SHOT = 'MODEL_SHOT',
  MODEL_CONFIG = 'MODEL_CONFIG',
  POSTER_GENERATION = 'POSTER_GENERATION',
  PRESET_STYLES = 'PRESET_STYLES',
  RESULT = 'RESULT'
}

export enum NavTab {
  CREATE = 'CREATE',
  GALLERY = 'GALLERY',
  PROFILE = 'PROFILE'
}

export type ImageSize = '1K' | '2K' | '4K';
export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type CameraFacingMode = 'user' | 'environment';
export type FramingType = 'Close-up' | 'Bust Shot' | 'Upper Body' | 'Full Body';

// 眼镜产品类型
export type EyewearCategory = 'Fashion Optical' | 'Sunglasses' | 'Sports' | 'Vintage' | 'Luxury';

// 服装预设
export type ClothingStyle = 'Business' | 'Casual' | 'Luxury' | 'Resort' | 'Street' | 'Sporty' | 'Vintage' | 'Minimalist';

// 姿态风格
export type PoseStyle = 'Professional' | 'Relaxed' | 'Avant-Garde' | 'Dynamic' | 'Elegant';

// 手部动作
export type HandAction = 'None' | 'Adjusting Glasses' | 'Touching Hair' | 'Thinking' | 'Touching Frame' | 'Crossing Arms';

export type CameraType = 'Hasselblad H6D' | 'Sony A7R V' | 'Fujifilm GFX 100II' | 'Leica M11';
export type LensType = '35mm f/1.4' | '50mm f/1.2' | '85mm f/1.4' | '100mm f/2.8 Macro' | '135mm f/1.8';
export type SkinTexture = 'High-Fidelity Realism' | 'Natural Commercial' | 'Soft Glow';

export type EthnicityType = 'East Asian' | 'Southeast Asian' | 'South Asian' | 'Caucasian' | 'Mediterranean' | 'Scandinavian' | 'African' | 'Hispanic/Latino' | 'Middle Eastern';

export type LightingType = 'Butterfly (Paramount)' | 'Rembrandt' | 'Rim Light' | 'Softbox Diffused' | 'Neon Noir' | 'Golden Hour';
export type MoodType = 'Cinematic Teal & Orange' | 'Classic Black & White' | 'High-Key Clean' | 'Low-Key Moody' | 'Vintage Film' | 'Natural Soft';

export interface GeneratedImage {
  id: string;
  url: string;
  type: string;
  timestamp: number;
}

export type PosterLayout = 'Centered' | 'Rule of Thirds' | 'Magazine Cover' | 'Minimalist Edge' | 'Diagonal Dynamic';
export type PosterTypography = 'Classic Serif' | 'Modern Sans-Serif' | 'Bold Display' | 'Elegant Script';
export type PosterTone = 'Luxury' | 'Avant-Garde' | 'Industrial' | 'Organic';
export type TypographyIntegration = 'Standard Print' | 'Etched into Material' | '3D Physical Object' | 'Light Projection';
export type SetMaterial = 'Brutalist Concrete' | 'White Marble' | 'Dark Silk' | 'Raw Basalt' | 'Brushed Aluminum';

export interface PosterConfig {
  title: string;
  subtitle: string;
  layout: PosterLayout;
  typography: PosterTypography;
  integration: TypographyIntegration;
  material: SetMaterial;
  tone: PosterTone;
  includeModel: boolean;
  camera: CameraType;
  lens: LensType;
  lighting: LightingType;
  mood: MoodType;
}

export interface ModelConfig {
  category: EyewearCategory;
  clothingStyle: ClothingStyle;
  poseStyle: PoseStyle;
  handAction: HandAction;
  ethnicity: EthnicityType;
  gender: 'Female' | 'Male' | 'Non-binary';
  scene: string;
  framing: FramingType;
  camera: CameraType;
  lens: LensType;
  skinTexture: SkinTexture;
  lighting: LightingType;
  mood: MoodType;
  aspectRatio: AspectRatio;
}

export interface User {
  phoneNumber: string;
  name: string;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}
