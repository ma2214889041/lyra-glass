
export enum AppMode {
  DASHBOARD = 'DASHBOARD',
  MODEL_SHOT = 'MODEL_SHOT',
  MODEL_CONFIG = 'MODEL_CONFIG',
  POSTER_GENERATION = 'POSTER_GENERATION',
  PRESET_STYLES = 'PRESET_STYLES',
  RESULT = 'RESULT',
  ADMIN = 'ADMIN'
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

export interface TemplateItem {
  id: string;
  imageUrl: string;
  name: string;
  description: string;
  config: ModelConfig;
}

export interface GeneratedImage {
  id: string;
  url: string;
  type: string;
  timestamp: number;
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

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}
