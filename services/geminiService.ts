
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

export const generateEyewearImage = async (
  imageBase64: string,
  size: ImageSize,
  modelConfig: ModelConfig
): Promise<string> => {
  const ai = getAI();
  const model = 'gemini-3-pro-image-preview';

  // 将审美标准内化为后台质量指令
  const internalQualityMandate = `
- SUBJECT AESTHETIC: The model must have professional fashion industry features, symmetrical face, and a sophisticated look compatible with high-end luxury branding.
- SKIN TEXTURE: Commercial-grade retouching. Perfectly smooth and clear skin, natural subsurface scattering, zero blemishes, zero acne, and healthy luster.
- OPTICAL ACCURACY: Eyewear must be rendered with physically accurate reflections and refractions on the lenses.
`;

  const ethnicityDetail = {
    'East Asian': 'East Asian professional fashion model, elegant facial structure, clear skin, sophisticated modern look.',
    'Southeast Asian': 'Southeast Asian model, radiant skin, balanced features, premium commercial appeal.',
    'South Asian': 'South Asian model, expressive features, defined contours, elegant skin tone, high-fashion grooming.',
    'Caucasian': 'Caucasian model, sharp facial structure, professional editorial look, high-fashion aesthetic.',
    'Mediterranean': 'Mediterranean model, warm skin, dark hair, captivating and healthy appearance.',
    'Scandinavian': 'Nordic model, striking clear features, luminous skin, minimalist look.',
    'African': 'African model, stunning deep skin tones, impeccable bone structure, high-contrast editorial style.',
    'Hispanic/Latino': 'Hispanic/Latino model, warm vibrant skin, expressive features, modern style.',
    'Middle Eastern': 'Middle Eastern model, striking facial contours, sophisticated luxury appearance.'
  }[modelConfig.ethnicity];

  const skinDetail = {
    'High-Fidelity Realism': 'High-end professional retouching. Natural skin grain but zero imperfections. Healthy glow.',
    'Natural Commercial': 'Advertising beauty finish. Flawless, silky smooth, and clear surface.',
    'Soft Glow': 'Luminous ethereal skin, delicate highlights, perfectly clear of any marks.'
  }[modelConfig.skinTexture];

  const lightingDetail = {
    'Butterfly (Paramount)': 'Top-down beauty lighting, emphasizes cheekbones and facial symmetry.',
    'Rembrandt': 'Classic cinematic lighting with a light triangle on the cheek, artistic and deep.',
    'Rim Light': 'Backlighting for silhouette definition, ensuring realistic separation from background.',
    'Softbox Diffused': 'Clean wraparound soft light, ideal for showcasing product materials.',
    'Neon Noir': 'Subtle cinematic color accents, realistic nighttime environment lighting.',
    'Golden Hour': 'Warm natural sunlight, realistic atmospheric volumetric effects.'
  }[modelConfig.lighting];

  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { 
          text: `
### PROFESSIONAL OPTICAL SHOOT DIRECTIVE
${internalQualityMandate}
- EYEWEAR: Preserve the EXACT design from the reference image. Place it accurately on the subject's face.
- SUBJECT: A ${modelConfig.age} ${modelConfig.gender} model.
- ETHNICITY: ${ethnicityDetail}
- FRAMING: ${modelConfig.framing}.
- PHOTOGRAPHY: Shot on ${modelConfig.camera} with ${modelConfig.lens}. Professional depth of field.
- SKIN: ${skinDetail}.
- LIGHTING: ${lightingDetail}
- SCENE: ${modelConfig.scene}. Render the environment with high-end architectural photography standards. Use natural textures (concrete, glass, fine wood), realistic bokeh, and authentic ambient occlusion.
- MOOD: ${modelConfig.mood}.
- OUTPUT: 8k photorealistic, commercial advertisement quality.
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
  throw new Error("渲染服务暂时不可用");
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
        { text: `
Create a high-end luxury advertisement.
- PRODUCT: Exact replica of the eyewear in the uploaded image.
- BRANDING: Title "${config.title}", Subtitle "${config.subtitle}".
- INTEGRATION: ${config.integration} into ${config.material}.
- COMPOSITION: ${config.layout}, Typography: ${config.typography}.
- QUALITY: Hyper-realistic, professional commercial finish.
` }
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
  throw new Error("渲染失败");
};

export const analyzeAndSuggestPosterConfigs = async (imageBase64: string): Promise<PosterRecommendation[]> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { text: "Suggest 3 luxury poster layouts. Return JSON ARRAY." }
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
  
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
  }
  
  parts.push({ 
    text: `Suggest 5 professional photography scene descriptions for eyewear models. Use high-end fashion terminology. Chinese only. Return as JSON array of strings.` 
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

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return [];
  }
};
