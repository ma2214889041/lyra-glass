
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ImageSize, AspectRatio, PosterConfig, AppMode, ModelConfig, EyewearType } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * [CORE DIRECTIVE] - 系统级硬约束
 * 永远锁死产品细节，不接受任何“艺术发挥”
 * 针对透光度与景别聚焦进行了深度强化
 */
const SYSTEM_INSTRUCTION = `
[CRITICAL PRODUCT FIDELITY REQUIREMENT - 100% REDUCTION]
1. The uploaded eyewear reference image must be reproduced with 100% pixel-accurate fidelity. This is a HARD CONSTRAINT.
2. OPTICAL TRANSPARENCY & LIGHT TRANSMISSION: Strictly maintain the exact transparency, translucency level, and tint of the lenses. 
   - If lenses are CLEAR in the reference, they MUST remain perfectly transparent in the output. 
   - The model's eyes and the skin behind the lenses must be SHARP, CLEAR, and visible with realistic optical refraction. 
   - ZERO tolerance for milky, cloudy, or opaque artifacts on the lenses.
3. No modification of frame shape, materials (acetate/metal/titanium), bridge structure, or temple curvature.
4. AUTO-DETECTION: Analyze the reference image for lens properties. For OPTICAL glasses, ensure light transmission is 100% accurate. For SUNGLASSES, match the tint density exactly.

[DYNAMIC FRAMING & FOCUS PROTOCOL]
Crucial instruction for non-close-up shots:
- IF Framing is 'Upper Body' or 'Full Body':
  - The eyewear MUST remain the absolute sharpest element in the entire image (Peak Focus).
  - Do NOT reduce eyewear detail due to distance. The model's pose and outfit are secondary context to showcase the eyewear style.
  - Use a shallow depth of field (f/1.4 - f/2.8 equivalent) to keep the eyewear tack sharp while softly blurring the background environment to create depth and atmosphere.
- IF Framing is 'Close-up': Focus is macro-sharp on frame texture and lens coatings.

Any deviation from the reference eyewear's properties is an absolute failure, regardless of the shot distance.
`;

/**
 * [DEVELOPER PROMPT] - 成像质量标准
 */
const DEVELOPER_PROMPT = `
[TECHNICAL RENDERING STANDARDS]
- Advanced Optical Ray-Tracing: Simulate exact light transmission and refraction through glass or polycarbonate materials.
- PBR (Physically Based Rendering): Lenses must exhibit high-fidelity surface properties (Reflection/Refraction/Transparency) based on the input image.
- Zero Cloudiness: Lenses must remain perfectly clear where the reference shows transparency. No "foggy" white layers on lenses.
- Commercial Photography Quality: Photorealistic skin texture with natural pores. Eyewear must be in tack-sharp focus (f/8 equivalent sharpness).
`;

const LIGHTING_INTENT_MAPPING: Record<string, string> = {
  'Butterfly (Paramount)': 'Top-front key light for symmetrical horizontal rim highlights on the frame.',
  'Rembrandt': '45-degree directional light for 3D volume and characteristic product shadows.',
  'Rim Light': 'Strong backlighting to create a luminous halo separating frame edges from background.',
  'Softbox Diffused': 'Wraparound soft box illumination, creating even gradients on acetate surfaces.',
  'Neon Noir': 'Dual-tone LED lighting with saturated specular reflections in the lenses.',
  'Golden Hour': 'Warm low-angle natural light (5600K) for honey-toned highlights.'
};

const VISUAL_PURPOSE_MAPPING: Record<string, string> = {
  'E-commerce Main': 'Clean, high-contrast, centered. Product details are extremely sharp. White or neutral background.',
  'Brand Campaign': 'Atmospheric storytelling. High-end editorial composition with deep textures.',
  'Social Media': 'Lifestyle-oriented, casual yet premium. Authentic snapshot quality with professional depth.',
  'Lookbook': 'Soft even lighting, neutral tones. Focus on accessory integration with style.',
  'Advertising Poster': 'Dynamic bold composition, high impact lighting, dramatic negative space.'
};

export const ensureApiKey = async (): Promise<void> => {
  if (window.aistudio) {
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await window.aistudio.openSelectKey();
    }
  }
};

const handleGeminiError = async (error: any) => {
  if (error?.message?.includes("Requested entity was not found.") && window.aistudio) {
    await window.aistudio.openSelectKey();
  }
  throw error;
};

export const generateEyewearImage = async (
  imageBase64: string,
  size: ImageSize,
  modelConfig: ModelConfig
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-image-preview';

  // 根据景别动态调整对模特姿势和服装的要求
  let postureAndOutfitInstruction = "";
  if (modelConfig.framing === 'Full Body' || modelConfig.framing === 'Upper Body') {
    postureAndOutfitInstruction = `
    - Pose: Dynamic, high-fashion editorial pose that showcases the eyewear clearly. Avoid hands blocking the frame front or temples.
    - Outfit: Stylized contemporary fashion that complements the eyewear vibe (e.g., if eyewear is sporty, outfit is premium activewear; if luxury, outfit is tailored chic).
    `;
  } else {
    postureAndOutfitInstruction = "- Pose: Natural head tilt, focusing attention on the eyes and eyewear. Hair styled away from the frame front, bridge, and temples.";
  }

  const userPrompt = `
  [PRIMARY SUBJECT — THE PRODUCT]
  - Subject: The Eyewear in the reference image.
  - Requirement: 100% exact reproduction of frame and lens light transmission.
  - Optical Performance: Ensure lenses are perfectly transparent or tinted exactly as in the reference. Eyes must be clearly visible through clear lenses.

  [SECONDARY SUBJECT — THE MODEL]
  - Identity: ${modelConfig.ethnicity} ${modelConfig.gender}, Age: ${modelConfig.age}.
  - Vibe: ${modelConfig.modelVibe}.
  - Framing Priority: The shot is a ${modelConfig.framing}. Ensure the focus is critical on the eyewear.
  ${postureAndOutfitInstruction}

  [TERTIARY CONTEXT — COMMERCIAL EXECUTION]
  - Visual Purpose: ${VISUAL_PURPOSE_MAPPING[modelConfig.visualPurpose] || modelConfig.visualPurpose}
  - Environment: ${modelConfig.scene}
  - Lighting Intent: ${LIGHTING_INTENT_MAPPING[modelConfig.lighting] || modelConfig.lighting}
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: DEVELOPER_PROMPT + "\n" + userPrompt }
        ]
      },
      config: { 
        systemInstruction: SYSTEM_INSTRUCTION,
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
    throw new Error("RENDER_FAILED");
  } catch (error) {
    return handleGeminiError(error);
  }
};

export const getPromptSuggestions = async (mode: AppMode, imageBase64?: string): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  const prompt = "Suggest 3 creative and realistic high-end commercial eyewear photography scene descriptions (max 12 words). Focus on luxury textures. Return JSON array of strings.";
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
      }
    });
    return JSON.parse(response.text.trim());
  } catch (e) {
    return ["Minimalist marble loft", "High-rise executive window", "Sunset stucco wall"];
  }
};

export const generatePosterImage = async (imageBase64: string, config: PosterConfig, size: ImageSize, aspectRatio: AspectRatio = '3:4'): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-image-preview';
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: `Create a luxury eyewear poster. Title: "${config.title}". Style: ${config.layout}. Material: ${config.material}.` }
        ]
      },
      config: {
        systemInstruction: "You are a luxury brand graphic designer. 100% product fidelity is mandatory. Ensure lens transparency is physically correct.",
        imageConfig: { aspectRatio, imageSize: size }
      }
    });
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("POSTER_FAILED");
  } catch (error) {
    return handleGeminiError(error);
  }
};
