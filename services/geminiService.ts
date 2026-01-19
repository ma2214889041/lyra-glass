
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ImageSize, AspectRatio, PosterConfig, AppMode, ModelConfig, FramingType, CameraType, LensType, SkinTexture, LightingType, MoodType, EthnicityType, ClothingStyle, PoseStyle, HandAction } from "../types";

// Fix: ensureApiKey already handles window.aistudio checks
export const ensureApiKey = async (): Promise<void> => {
  if (window.aistudio) {
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await window.aistudio.openSelectKey();
    }
  }
};

const CLOTHING_DESCRIPTIONS: Record<ClothingStyle, string> = {
  'Business': 'Professional business attire. Male: deep navy tailored suit jacket, crisp white cotton shirt, silk tie, luxury watch. Female: structured blazer, silk blouse, tailored trousers or pencil skirt, elegant minimalist jewelry.',
  'Casual': 'Modern everyday fashion. High-quality cotton T-shirt or casual button-down shirt, slim-fit denim or chinos, clean sneakers. Soft textures and relaxed fit.',
  'Luxury': 'High-end couture fashion. Deep black or pearl white structured garments with architectural necklines. Luxury materials like silk, cashmere, or fine wool. Refined accessories.',
  'Resort': 'Elegant vacation wear. Loose-fitting linen shirts, pastel-colored polo shirts, lightweight sundresses, or silk kaftans. Breezy fabrics that react naturally to wind.',
  'Street': 'Contemporary urban streetwear. Oversized high-quality hoodies, designer cargo pants, limited-edition sneakers. Layered textures like denim and heavy jersey.',
  'Sporty': 'Premium athletic performance wear. Technical moisture-wicking fabrics, compression tops, structured sports jackets. High-contrast colors and ergonomic seams.',
  'Vintage': 'Heritage-inspired aesthetic. Textured wool cardigans, tweed jackets, high-waisted trousers, 1950s style dresses. Muted earth tones and classic patterns.',
  'Minimalist': 'Essential monochrome aesthetic. Clean-cut black or white essentials. No visible branding, focusing entirely on silhouette and premium material texture.'
};

const POSE_DESCRIPTIONS: Record<PoseStyle, string> = {
  'Professional': 'Confident and poised standing or sitting posture. Shoulders back, spine neutral. Direct gaze into the lens, conveying authority and trust.',
  'Relaxed': 'Natural, slightly asymmetrical leaning posture. One shoulder dropped, body angled comfortably. Soft, effortless gaze slightly away from the camera.',
  'Avant-Garde': 'Dynamic fashion-editorial stance. Unusual angles, sharp silhouettes, and dramatic presence. Intense, piercing gaze.',
  'Dynamic': 'Athletic and energetic posture. Mid-motion capture, balanced weight distribution, conveying strength and movement.',
  'Elegant': 'Graceful and fluid silhouette. Soft curves, light movement in the torso. Head tilted subtly to highlight facial symmetry.'
};

const HAND_ACTION_DESCRIPTIONS: Record<HandAction, string> = {
  'None': 'Hands are resting naturally out of the primary frame.',
  'Adjusting Glasses': 'One hand is delicately touching the temple of the eyewear, as if making a precise adjustment. Fingers are slender and well-groomed.',
  'Touching Hair': 'One arm is raised gracefully, hand lightly brushing back a strand of hair, creating a natural and candid movement.',
  'Thinking': 'One hand is poised near the chin or cheek in a thoughtful gesture, adding intellectual depth to the portrait.',
  'Touching Frame': 'Finger lightly resting on the top edge of the frame, drawing visual focus to the product craftsmanship.',
  'Crossing Arms': 'Arms are folded confidently in front of the chest, creating a strong visual structure.'
};

const SKIN_DESCRIPTIONS: Record<SkinTexture, string> = {
  'High-Fidelity Realism': 'Authentic skin with visible pores, natural surface variations, and healthy clarity. No artificial smoothing.',
  'Natural Commercial': 'Polished commercial skin standards. Smoothed texture while retaining natural dimensionality and believability.',
  'Soft Glow': 'Ethereal, luminous quality with diffused highlights creating a gentle radiance. Soft-focus surface while maintaining structure.'
};

// Fix: Create a new GoogleGenAI instance right before making an API call to ensure it always uses the most up-to-date API key
export const generateEyewearImage = async (
  imageBase64: string,
  size: ImageSize,
  modelConfig: ModelConfig
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-image-preview';

  const prompt = `
[STRICT PRODUCT FIDELITY]
100% exact reproduction of the eyewear in the attached image. Replicate every design element, hinge, and material texture with forensic accuracy. Metallic frames must show sharp reflections; acetate must show deep satin finish. Lenses catch 25% environmental reflection.

[MODEL & CHARACTER]
Ethnicity: ${modelConfig.ethnicity}. Gender: ${modelConfig.gender}.
Clothing: ${CLOTHING_DESCRIPTIONS[modelConfig.clothingStyle]}.
Pose: ${POSE_DESCRIPTIONS[modelConfig.poseStyle]}.
Hand Action: ${HAND_ACTION_DESCRIPTIONS[modelConfig.handAction]}.
Skin: ${SKIN_DESCRIPTIONS[modelConfig.skinTexture]}.

[COMPOSITION & CAMERA]
Framing: ${modelConfig.framing}. 
Camera: ${modelConfig.camera} with ${modelConfig.lens}. Professional commercial depth of field.
Lighting: ${modelConfig.lighting}.
Mood: ${modelConfig.mood}.

[ENVIRONMENT]
${modelConfig.scene}

[OUTPUT]
8K ultra-high resolution commercial photography. Pixel-perfect product rendering.
`;

  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { text: prompt }
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

// Fix: Create a new GoogleGenAI instance right before making an API call
export const analyzeEyewearAndSuggestScene = async (
  imageBase64: string
): Promise<any[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { 
          text: `Analyze this eyewear and recommend 3 scene IDs from: modern_office, executive_library, arch_corridor, urban_loft, coastal_terrace, nordic_home, gym_modern, retro_bar.
Return JSON: [{ "id": "...", "reason": "..." }]`
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

  try { return JSON.parse(response.text || "[]"); } catch { return []; }
};

// Fix: Create a new GoogleGenAI instance right before making an API call
export const generatePosterImage = async (
  imageBase64: string,
  config: PosterConfig,
  size: ImageSize,
  aspectRatio: AspectRatio = '3:4'
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-image-preview';
  
  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { text: `Luxury eyewear brand poster. Exact product fidelity. Title: "${config.title}", Subtitle: "${config.subtitle}". Layout: ${config.layout}. Material: ${config.material}. Tone: ${config.tone}.` }
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

// Fix: Added missing getPromptSuggestions export
export const getPromptSuggestions = async (
  mode: AppMode,
  imageBase64?: string
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';

  const prompt = `As a high-end fashion creative director, suggest 3 professional photography scenarios or branding taglines for this eyewear.
  Context: ${mode}.
  Return only a JSON array of strings.`;

  const parts: any[] = [{ text: prompt }];
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
  }

  const response = await ai.models.generateContent({
    model,
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
  } catch {
    return [];
  }
};
