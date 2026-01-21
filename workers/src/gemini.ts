import { GoogleGenAI } from "@google/genai";

const ATMOSPHERE_ENHANCEMENT: Record<string, string> = {
  'High-Fashion Edge': "Editorial avant-garde styling, high-contrast shadows, sharp silhouettes, urban brutalist background. Cold color temperature.",
  'Natural & Friendly': "Warm morning sunlight, soft linen clothing, candid posture, cozy garden or sunlit library setting. Dappled light shadows.",
  'Professional Executive': "Clean office architecture, glass reflections, sharp corporate attire, cool-toned professional lighting with luxury textures.",
  'Athletic Energy': "Dynamic outdoor lighting, premium activewear textures, morning dew or sweat sheen, high-speed shutter aesthetic.",
  'Calm & Intellectual': "Soft diffused interior light, minimalist wooden textures, neutral tones, scholarly atmosphere with soft depth of field."
};

const SYSTEM_INSTRUCTION = `
[CRITICAL EYEWEAR FIDELITY - THIS IS THE CORE REQUIREMENT]

The uploaded eyewear MUST be reproduced with 100% fidelity. This is NON-NEGOTIABLE.

1. FRAME REPRODUCTION
   - Exact frame shape: Do NOT alter curves, angles, or proportions
   - Exact materials: Metal finish (brushed/polished), acetate texture, titanium sheen, etc.
   - Exact colors: Match the exact color tone, gradients, and patterns
   - Exact logos/branding: Reproduce any visible logos, text, or emblems precisely
   - Temple arms: Correct shape, thickness, and hinge details

2. LENS REPRODUCTION
   - If SUNGLASSES with dark/tinted/mirrored lenses: Keep lenses dark/tinted/mirrored. Do NOT make them transparent.
   - If OPTICAL GLASSES with clear lenses: Keep lenses clear and transparent.
   - Maintain exact lens tint color if colored (blue, brown, gradient, etc.)
   - Show realistic lens reflections from environment lighting

3. PHYSICAL INTEGRATION
   - Eyewear must cast natural shadows on face (bridge of nose, temples)
   - Show realistic light reflections on frame surfaces
   - Frame must sit naturally on nose bridge and ears
   - NO "photoshopped sticker" appearance - must look physically present

[FOCUS PROTOCOL]
- The eyewear product is ALWAYS the sharpest element in the image
- Use subtle background blur (bokeh) to emphasize the eyewear

Any deviation from the uploaded eyewear's appearance is an ABSOLUTE FAILURE.
`;

const DEVELOPER_PROMPT = `
[SKIN QUALITY - REALISTIC BUT HEALTHY]
- Natural skin texture with subtle visible pores (NOT overly smooth plastic look)
- HEALTHY, FLAWLESS skin with even tone - NO blemishes, NO acne, NO dark spots
- Natural skin glow and radiance - youthful, well-maintained appearance
- Authentic subsurface scattering for realistic skin translucency
- NO artificial "AI filter" over-smoothing that removes all texture
- Natural, professional makeup (female models) that enhances rather than masks

[TECHNICAL RENDERING]
- PBR (Physically Based Rendering) for accurate material properties
- Realistic light interaction with frame materials (metal reflections, acetate transparency)
- Commercial photography quality with professional lighting
`;

const LIGHTING_INTENT_MAPPING: Record<string, string> = {
  'Butterfly (Paramount)': 'Top-front key light for symmetrical horizontal rim highlights.',
  'Rembrandt': '45-degree directional light for 3D volume and triangular eye-light.',
  'Rim Light': 'Strong backlighting to create a luminous halo separating edges from background.',
  'Softbox Diffused': 'Wraparound soft box illumination, even gradients.',
  'Neon Noir': 'Dual-tone LED lighting with saturated specular reflections.',
  'Golden Hour': 'Warm low-angle natural light (5600K) for honey-toned highlights.'
};

const GENDER_MODEL_SPECS: Record<string, { model: string; features: string; styling: string; pose: string }> = {
  male: {
    model: 'East Asian male model, age 25-35',
    features: 'Strong jawline, natural grooming, confident expression',
    styling: 'Masculine tailored clothing, clean lines',
    pose: 'Confident stance with strong presence, direct gaze'
  },
  female: {
    model: 'East Asian female model, age 25-35',
    features: 'Refined features, sophisticated makeup, elegant styling',
    styling: 'Feminine high-fashion styling, graceful silhouette',
    pose: 'Graceful posture with refined presence, engaging gaze'
  }
};

/**
 * 获取 Gemini AI 实例
 */
function getAI(apiKey: string): GoogleGenAI {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 未配置');
  }
  return new GoogleGenAI({ apiKey });
}

interface ModelConfig {
  framing: string;
  scene: string;
  visualPurpose: string;
  camera: string;
  lens: string;
  lighting: string;
  mood: string;
  skinTexture: string;
  aspectRatio: string;
  modelVibe: string;
}

/**
 * 生成眼镜模特图
 */
export async function generateEyewearImage(
  apiKey: string,
  imageBase64: string,
  size: string,
  modelConfig: ModelConfig,
  gender: string = 'female'
): Promise<string> {
  const ai = getAI(apiKey);
  const model = 'gemini-3-pro-image-preview';

  const atmosphericContext = ATMOSPHERE_ENHANCEMENT[modelConfig.modelVibe] || "";
  const genderSpec = GENDER_MODEL_SPECS[gender] || GENDER_MODEL_SPECS.female;

  const postureInstruction = modelConfig.framing === 'Full Body' || modelConfig.framing === 'Upper Body'
    ? `${genderSpec.pose}. Editorial interaction with environment that emphasizes the eyewear's profile.`
    : `${genderSpec.pose}. Natural head tilt, direct eye contact through lenses, hair styled behind ears to show temples.`;

  const userPrompt = `
  [PRIMARY SUBJECT — THE PRODUCT]
  - Subject: The Eyewear from the reference image. 100% fidelity.
  - Lens Detail: Absolute clarity, eyes visible through lenses if clear.

  [MODEL SPECIFICATIONS]
  - Model: ${genderSpec.model}
  - Features: ${genderSpec.features}
  - Styling: ${genderSpec.styling}

  [ATMOSPHERE & CONTEXT]
  ${atmosphericContext}
  - Environment: ${modelConfig.scene}
  - Mood & Posture: ${postureInstruction}

  [PHOTOGRAPHY SPECIFICATION]
  - Visual Style: ${modelConfig.visualPurpose}
  - Shot Type: ${modelConfig.framing}
  - Gear: ${modelConfig.camera} with ${modelConfig.lens}
  - Lighting: ${LIGHTING_INTENT_MAPPING[modelConfig.lighting] || modelConfig.lighting}
  - Final Finish: ${modelConfig.mood}, skin texture set to ${modelConfig.skinTexture}.
  `;

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
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }
  throw new Error("RENDER_FAILED");
}

/**
 * 生成海报图
 */
export async function generatePosterImage(
  apiKey: string,
  imageBase64: string,
  config: { title: string; layout: string; material: string },
  size: string,
  aspectRatio: string = '3:4'
): Promise<string> {
  const ai = getAI(apiKey);
  const model = 'gemini-3-pro-image-preview';

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
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }
  throw new Error("POSTER_FAILED");
}

/**
 * 获取提示建议
 */
export async function getPromptSuggestions(
  apiKey: string,
  mode: string,
  imageBase64?: string
): Promise<string[]> {
  const ai = getAI(apiKey);

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64
      }
    });
  }

  parts.push({
    text: `Generate 5 creative photography scene descriptions in Chinese for a high-end eyewear commercial shoot. The application mode is ${mode}. Suggestions should be short, evocative, and suitable for a professional fashion shoot. Return as a JSON array of strings.`
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: { parts },
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) return getDefaultSuggestions();
    return JSON.parse(text);
  } catch (error) {
    console.error("Prompt suggestion error:", error);
    return getDefaultSuggestions();
  }
}

function getDefaultSuggestions(): string[] {
  return [
    "极简主义水泥工作室，配合硬朗冷色调光影。",
    "自然午后暖阳，透过绿植形成的斑驳光影。",
    "都市霓虹夜景，带有电影感的蓝橘色调对比。",
    "高端行政走廊，通透大面积玻璃墙与城市远景。",
    "法式复古图书馆，柔和的书卷气与自然漫反射光。"
  ];
}

/**
 * 使用模板提示词生成图片
 */
export async function generateFromTemplate(
  apiKey: string,
  eyewearImageBase64: string,
  templatePrompt: string,
  aspectRatio: string = '3:4'
): Promise<string> {
  const ai = getAI(apiKey);
  const model = 'gemini-3-pro-image-preview';

  const fullPrompt = `
${SYSTEM_INSTRUCTION}

${DEVELOPER_PROMPT}

[TEMPLATE-BASED GENERATION]
使用以下提示词，结合上传的眼镜产品图，生成商业级模特试戴效果图：

${templatePrompt}

[CRITICAL EYEWEAR FIDELITY REQUIREMENTS]
- The uploaded eyewear MUST be reproduced with 100% pixel-accurate fidelity
- This could be SUNGLASSES, OPTICAL GLASSES, READING GLASSES, or any eyewear type - preserve its exact nature
- Match exactly: frame shape, frame material, frame color, temple design, ALL branding/logos
- LENS properties: If SUNGLASSES → keep lenses dark/tinted/mirrored as in reference. If OPTICAL glasses → keep lenses clear and transparent
- Model wears the eyewear naturally: proper fit on nose bridge, temples behind ears
- Natural physical shadows cast by frame on face
- Realistic light reflections on lenses and frame

[SKIN QUALITY]
- Natural skin texture with subtle pores - NOT plastic/artificial
- HEALTHY, FLAWLESS skin - NO blemishes, NO spots, even skin tone
- Natural glow and radiance, youthful appearance

[OUTPUT]
- High-quality commercial photography effect
- Sharp focus on the eyewear product
`;

  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: eyewearImageBase64 } },
        { text: fullPrompt }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: '1K'
      }
    }
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64Data = part.inlineData.data;

        if (!base64Data || base64Data.length < 100) {
          console.error('[Gemini] Image data too small or empty');
          throw new Error("INVALID_IMAGE_DATA_TOO_SMALL");
        }

        console.log(`[Gemini] Generated image size: ${(base64Data.length / 1024).toFixed(2)} KB`);
        return `data:image/png;base64,${base64Data}`;
      }
    }
  }

  console.error('[Gemini] No image data in response');
  throw new Error("TEMPLATE_RENDER_FAILED");
}

/**
 * 优化提示词（管理员专用）
 */
export async function optimizePrompt(
  apiKey: string,
  rawPrompt: string
): Promise<{
  name: string;
  description: string;
  defaultGender: string;
  defaultFraming: string;
  female: string;
  male: string | null;
}> {
  const ai = getAI(apiKey);
  const model = 'gemini-3-flash-preview';

  const systemPrompt = `You are a prompt adapter for eyewear photography. Your task is to make MINIMAL changes to the user's prompt.

[CRITICAL RULES]

1. TREAT INPUT AS RAW STRING - DO NOT CHANGE FORMAT
   - Treat the ENTIRE input as a raw string, whether it's JSON, plain text, or any other format
   - DO NOT parse, restructure, or reformat the input
   - Only INSERT or REPLACE specific text content within the original string

2. EYEWEAR FIDELITY (CRITICAL - ALWAYS REQUIRED)
   - ALWAYS include this statement: "Model wearing the eyewear/sunglasses from the reference image with 100% fidelity"

3. SKIN QUALITY (ALWAYS INCLUDE)
   - Required statement: "Realistic healthy skin with natural texture and visible pores, authentic and lifelike, NOT artificial or plastic or ceramic"

4. GENDER ADAPTATION
   - Create TWO versions: female and male
   - Match the SAME VIBE and SCENE appropriately

5. USE PLACEHOLDERS
   - Use {{ethnicity}} for model ethnicity
   - Use {{age}} for age group

6. GENERATE METADATA
   - name: Short Chinese name (2-6 chars)
   - description: Chinese description (10-30 chars)
   - defaultGender: 'male' or 'female'
   - defaultFraming: 'Close-up', 'Upper Body', or 'Full Body'

[OUTPUT FORMAT]
Return ONLY valid JSON:
{
  "name": "模板名称",
  "description": "模板描述",
  "defaultGender": "female",
  "defaultFraming": "Close-up",
  "female": "prompt for female...",
  "male": "prompt for male..."
}`;

  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { text: `ADAPT this prompt with MINIMAL changes:\n\n${rawPrompt}` }
      ]
    },
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      temperature: 0.2
    }
  });

  if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
    const text = response.candidates[0].content.parts[0].text.trim();
    try {
      return JSON.parse(text);
    } catch {
      return {
        name: '自定义模板',
        description: '用户自定义模板',
        defaultGender: 'female',
        defaultFraming: 'Close-up',
        female: text,
        male: null
      };
    }
  }
  throw new Error("PROMPT_OPTIMIZATION_FAILED");
}
