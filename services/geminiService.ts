
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ImageSize, AspectRatio, PosterConfig, PosterRecommendation, AppMode, ModelConfig, FramingType, CameraType, LensType, SkinTexture, LightingType, MoodType, EthnicityType } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const ensureApiKey = async (): Promise<void> => {
  if (window.aistudio) {
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await window.aistudio.openSelectKey();
    }
  }
};

/**
 * 映射 UI 选项到技术化摄影指令
 */
const TECHNICAL_MAPPINGS = {
  skin: {
    'High-Fidelity Realism': 'The skin shows authentic texture with visible pores and natural surface variation, maintaining healthy clarity without artificial smoothing. Subtle imperfections are preserved to convey realism.',
    'Natural Commercial': 'The complexion is polished to commercial beauty standards with smoothed texture while retaining natural dimensionality. Skin appears flawless yet believable, with healthy luminosity.',
    'Soft Glow': 'The skin has an ethereal, luminous quality with diffused highlights creating a gentle radiance. Surface texture is minimized while maintaining facial structure and natural contours.'
  }
};

// 构建情境化姿态描述
const buildFramingNarrative = (framing: FramingType, age: string, gender: string): string => {
  const ageModifiers = {
    'Child': 'playful and natural',
    'Teenager': 'energetic yet composed',
    'Youth': 'vibrant and confident',
    'Adult': 'poised and self-assured',
    'Mature': 'dignified and relaxed'
  };

  const genderNuances = {
    'Female': 'with graceful lines and elegant posture',
    'Male': 'with strong, stable presence and structured positioning',
    'Non-binary': 'with balanced, authentic self-presentation'
  };

  const framingBase = {
    'Close-up': `A close-up portrait framed from upper chest to crown, placing primary emphasis on facial features and the eyewear. The subject's head position creates optimal eyewear visibility through a subtle angle. The expression is ${ageModifiers[age as keyof typeof ageModifiers]} ${genderNuances[gender as keyof typeof genderNuances]}, with direct eye contact that engages the viewer naturally.`,
    'Bust Shot': `A bust shot composition extending from mid-chest upward, providing professional portrait context. The subject adopts a relaxed posture ${genderNuances[gender as keyof typeof genderNuances]}, with shoulders positioned at a natural angle. The overall bearing is ${ageModifiers[age as keyof typeof ageModifiers]}.`,
    'Upper Body': `An upper body portrait from waist to head. The stance is ${ageModifiers[age as keyof typeof ageModifiers]} ${genderNuances[gender as keyof typeof genderNuances]}, creating visual structure through natural body positioning.`,
    'Full Body': `A full-length portrait showing the complete figure. The subject's full-body stance embodies ${ageModifiers[age as keyof typeof ageModifiers]} presence ${genderNuances[gender as keyof typeof genderNuances]}. Despite the wider framing, the eyewear remains clearly visible and properly scaled.`
  };

  return framingBase[framing];
};

// 构建场景与光线的综合叙事
const buildLightingNarrative = (lighting: LightingType, scene: string): string => {
  const isOutdoorScene = scene.toLowerCase().includes('terrace') || 
                         scene.toLowerCase().includes('beach') || 
                         scene.toLowerCase().includes('forest') ||
                         scene.toLowerCase().includes('outdoor');

  const lightingNarratives = {
    'Butterfly (Paramount)': isOutdoorScene 
      ? 'Natural overhead sunlight creates soft, even illumination with gentle shadows beneath the nose. flatering beauty quality.'
      : 'Professional beauty lighting with diffused illumination from above and in front. Skin tone appears luminous.',
    'Rembrandt': 'Classic studio lighting at forty-five degrees creates chiaroscuro effects with a triangular highlight on the shadowed cheek.',
    'Rim Light': 'Dramatic backlighting creates a luminous outline separating the subject from the background.',
    'Softbox Diffused': 'Large, diffused light sources provide wraparound illumination that is exceptionally even and flattering.',
    'Neon Noir': 'Atmospheric lighting featuring carefully balanced colored accents creates contemporary editorial mood.',
    'Golden Hour': 'Warm, low-angle natural sunlight around 3200K creates long soft shadows and gentle modeling. Lenses show realistic sky reflections.'
  };

  return lightingNarratives[lighting];
};

export const generateEyewearImage = async (
  imageBase64: string,
  size: ImageSize,
  modelConfig: ModelConfig
): Promise<string> => {
  const ai = getAI();
  const model = 'gemini-3-pro-image-preview';

  const framingNarrative = buildFramingNarrative(modelConfig.framing, modelConfig.age, modelConfig.gender);
  const lightingNarrative = buildLightingNarrative(modelConfig.lighting, modelConfig.scene);
  const skinInstruction = TECHNICAL_MAPPINGS.skin[modelConfig.skinTexture as keyof typeof TECHNICAL_MAPPINGS.skin];

  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { 
          text: `
Create a premium commercial eyewear product photograph.

ABSOLUTE PRODUCT FIDELITY:
Eyewear must be replicated with forensic, pixel-perfect accuracy. Every design element must match exactly. Metallic frames display sharp reflections; Acetate frames exhibit satin finish with subtle grain.
Lens surfaces catch environmental lighting as natural reflections (20-30% area). Eyes remain clearly visible through lenses with subtle focal distortion.

SUBJECT & COMPOSITION:
${framingNarrative}
Model: ${modelConfig.ethnicity} professional aesthetic, ${modelConfig.age} age, ${modelConfig.gender} gender.

ENVIRONMENTAL SETTING:
${modelConfig.scene}

LIGHTING & ATMOSPHERE:
${lightingNarrative}

SKIN & MAKEUP:
${skinInstruction} Natural beauty standards.

COLOR & MOOD:
${modelConfig.mood} color grading. Absolute color accuracy for product.

OUTPUT: 8K resolution commercial photography quality.
`
        }
      ]
    },
    config: { 
      imageConfig: { 
        aspectRatio: modelConfig.aspectRatio, 
        imageSize: size 
      } 
    }
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("RENDER_ENGINE_UNAVAILABLE");
};

export interface SceneRecommendation {
  id: string;
  reason: string;
}

export const analyzeEyewearAndSuggestScene = async (
  imageBase64: string
): Promise<SceneRecommendation[]> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { 
          text: `Analyze this eyewear and recommend 3 scene IDs from the list below. 
Provide a short Chinese reason for each recommendation (e.g. "金属细框设计，建议使用简约现代场景突出产品线条感").

Scene IDs:
- modern_office_window
- executive_library
- architectural_corridor
- urban_industrial
- coastal_terrace
- scandinavian_interior

Return ONLY a JSON array of objects: [{ "id": "...", "reason": "..." }]`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            reason: { type: Type.STRING }
          }
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return [];
  }
};

export const generatePosterImage = async (
  imageBase64: string,
  config: PosterConfig,
  size: ImageSize,
  aspectRatio: AspectRatio = '3:4'
): Promise<string> => {
  const ai = getAI();
  const model = 'gemini-3-pro-image-preview';
  
  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { text: `Create a luxury brand poster for eyewear. Exact product fidelity. Title: "${config.title}", Subtitle: "${config.subtitle}". Layout: ${config.layout}. Material: ${config.material}. Tone: ${config.tone}.` }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: size
      }
    }
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("POSTER_RENDER_FAILED");
};

export const analyzeAndSuggestPosterConfigs = async (imageBase64: string): Promise<PosterRecommendation[]> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { text: "Analyze eyewear and suggest 3 luxury poster designs. Return JSON array." }
      ]
    },
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            title: { type: Type.STRING },
            subtitle: { type: Type.STRING },
            layout: { type: Type.STRING },
            typography: { type: Type.STRING },
            integration: { type: Type.STRING },
            material: { type: Type.STRING },
            tone: { type: Type.STRING },
            includeModel: { type: Type.BOOLEAN },
            camera: { type: Type.STRING },
            lens: { type: Type.STRING },
            lighting: { type: Type.STRING },
            mood: { type: Type.STRING }
          }
        }
      }
    }
  });
  try { return JSON.parse(response.text || "[]"); } catch (e) { return []; }
};

export const getPromptSuggestions = async (mode: AppMode, imageBase64?: string): Promise<string[]> => {
  const ai = getAI();
  const parts: any[] = [];
  if (imageBase64) parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
  
  parts.push({ 
    text: `Suggest 5 professional eyewear photography scene descriptions in Chinese. Return JSON array of strings.` 
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  try { return JSON.parse(response.text || "[]"); } catch (e) { return []; }
};
