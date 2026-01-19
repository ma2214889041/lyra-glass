
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
    'High-Fidelity Realism': 'Frequency separation retouching: preserve 40% original skin texture, micro-detail retained, zero blemish removal.',
    'Natural Commercial': 'Commercial beauty finish: 85% texture smoothing, maintain natural pore structure in non-highlight areas, healthy luminosity enhancement.',
    'Soft Glow': 'Ethereal skin treatment: 95% surface smoothing, diffused highlight zones +0.5EV, complete blemish elimination with maintained facial structure.'
  }
};

export const generateEyewearImage = async (
  imageBase64: string,
  size: ImageSize,
  modelConfig: ModelConfig
): Promise<string> => {
  const ai = getAI();
  const model = 'gemini-3-pro-image-preview';

  const framingNarrative = {
    'Close-up': 'A close-up portrait focusing on the face and upper shoulders. The subject looks directly at the camera with a subtle, confident expression. Frame the shot to clearly showcase the eyewear while maintaining natural eye contact.',
    'Bust Shot': 'A bust shot capturing from mid-chest to the top of the head. The subject adopts a relaxed, slightly turned pose with one shoulder forward. Hands are positioned naturally, either resting or gently touching the frames.',
    'Upper Body': 'An upper body shot from waist level upward. The subject stands in a three-quarter pose, with arms positioned to create visual interest without obscuring the eyewear. Background elements provide environmental context.',
    'Full Body': 'A full-length portrait showing the complete figure in an architectural setting. The subject strikes a confident editorial pose, with the eyewear remaining clearly visible despite the wider framing. Environmental elements frame the composition.'
  }[modelConfig.framing];

  const lightingNarrative = {
    'Butterfly (Paramount)': 'Studio lighting setup with a large softbox positioned directly above and in front of the subject, creating a distinctive butterfly-shaped shadow beneath the nose. Fill lights at camera level soften shadows under the cheekbones. The eyewear frames catch crisp highlights along their top edge.',
    'Rembrandt': 'Classic Rembrandt lighting with the key light at 45 degrees to the side and slightly elevated, casting a characteristic triangular highlight on the shadowed cheek. Minimal fill light preserves dramatic contrast. Eyewear lenses show graduated reflections corresponding to the light position.',
    'Rim Light': 'Dramatic backlighting positioned behind and above the subject, creating a luminous outline along the hair and shoulders. The eyewear frames are edged with brilliant highlights while the face receives subtle frontal fill, separating the subject from a darker background.',
    'Softbox Diffused': 'Professional studio setup with large octagonal softboxes providing wraparound illumination. Light is even and flattering across the face, with soft gradual shadows. Eyewear reflections are controlled and subtle, showing diffused light sources rather than harsh specular points.',
    'Neon Noir': 'Cinematic atmospheric lighting with colored accent lights (cyan and warm amber tones) creating a contemporary editorial mood. Realistic light falloff and subtle environmental haze add depth. Eyewear lenses pick up the colored light sources with natural intensity.',
    'Golden Hour': 'Natural outdoor lighting during the golden hour, with warm sunlight at approximately 15 degrees above the horizon. Light has a honey-gold quality with long, soft shadows. The eyewear frames are rimmed with golden highlights, and lenses show realistic sky reflections with subtle lens flares.'
  }[modelConfig.lighting];

  // 场景描述逻辑优化：判断是否是预设的长文本描述
  const finalSceneDesc = modelConfig.scene.length > 50 
    ? modelConfig.scene 
    : `The setting features ${modelConfig.scene}. Render this environment with architectural photography standards - surfaces show realistic texture and color variation, glass elements exhibit accurate refraction.`;

  const skinInstruction = TECHNICAL_MAPPINGS.skin[modelConfig.skinTexture];

  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { 
          text: `
This is a premium commercial eyewear product photograph featuring a professional model. 
CRITICAL REQUIREMENT: The eyewear from the reference image must be replicated with pixel-perfect accuracy. Preserve the exact frame geometry, temple design, bridge structure, and lens characteristics. Do not modify the eyewear style, material finish, or color in any way.

SUBJECT & COMPOSITION:
${framingNarrative} 
The model is a ${modelConfig.age} ${modelConfig.gender} of ${modelConfig.ethnicity} descent, exhibiting professional fashion model aesthetics with symmetrical facial features and a sophisticated appearance suitable for luxury brand imaging.

EYEWEAR PRESENTATION PRIORITIES:
The eyewear sits naturally on the subject's nose bridge with realistic contact points and subtle pressure indication at the nose pads. Temple tips are positioned correctly behind the ears. 
Frame material rendering: Metallic frames display sharp environmental reflections; Acetate frames exhibit a subtle satin finish with natural grain; Titanium frames show a characteristic brushed metal surface.

Lens specifications: Maintain optical thickness visible at the lens edges. Render realistic refraction index effects - eyes should be clearly visible through lenses but with subtle focal distortion. Lens surfaces show 15-25% environmental reflection.

LIGHTING & ATMOSPHERE:
${lightingNarrative}

ENVIRONMENT & SETTING:
${finalSceneDesc}

SKIN TREATMENT & MAKEUP:
${skinInstruction} Complexion is clear and healthy with natural luminosity. Makeup is professionally applied.

COLOR GRADING & MOOD:
Apply ${modelConfig.mood} color characteristics using ACES color workflow.

REALISM VALIDATION CHECKPOINTS:
1. EYEPOCKET PHYSICS: Natural contact points on nose and ears.
2. PROPORTIONAL SCALE: Dimensions correspond to facial scale.
3. OPTICAL INTEGRATION: Lens reflections correspond to environment.
4. MATERIAL COHERENCE: Consistent textures across lighting angles.

OUTPUT SPECIFICATIONS: 8K resolution commercial photography quality.
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

export const analyzeEyewearAndSuggestScene = async (
  imageBase64: string
): Promise<string[]> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { 
          text: `Analyze this eyewear product and recommend 3 most suitable scene IDs from the following list based on frame style, material, and target demographic.

Options:
- modern_office_window: Sleek, contemporary, corporate
- executive_library: Classic, sophisticated, intellectual
- minimalist_conference: Bold, architectural, geometric
- architectural_corridor: Avant-garde, modernist, designer
- glass_atrium: Lightweight, minimalist, clean
- urban_industrial: Vintage-inspired, edgy, artistic
- coastal_terrace: Sunglasses, casual-elegant, luxury
- forest_morning: Natural, eco-friendly, organic
- scandinavian_interior: Minimalist Nordic, serene, refined

Return ONLY a JSON array of 3 scene IDs that best match this eyewear style.`
        }
      ]
    },
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
<POSTER_DIRECTIVE>
  Product: Exact replica of the eyewear in the image.
  Typography: Title "${config.title}", Subtitle "${config.subtitle}".
  Material Integration: ${config.integration} into ${config.material}.
  Layout: ${config.layout}, Typography Style: ${config.typography}.
  Finish: Luxury brand visual standards, hyper-realistic textures.
</POSTER_DIRECTIVE>
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
  throw new Error("POSTER_RENDER_FAILED");
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
  if (imageBase64) parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
  
  parts.push({ 
    text: `Suggest 5 professional scene descriptions for luxury eyewear. Chinese only. JSON array of strings.` 
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
