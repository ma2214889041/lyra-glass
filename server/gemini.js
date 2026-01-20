import { GoogleGenAI } from "@google/genai";

const ATMOSPHERE_ENHANCEMENT = {
  'High-Fashion Edge': "Editorial avant-garde styling, high-contrast shadows, sharp silhouettes, urban brutalist background. Cold color temperature.",
  'Natural & Friendly': "Warm morning sunlight, soft linen clothing, candid posture, cozy garden or sunlit library setting. Dappled light shadows.",
  'Professional Executive': "Clean office architecture, glass reflections, sharp corporate attire, cool-toned professional lighting with luxury textures.",
  'Athletic Energy': "Dynamic outdoor lighting, premium activewear textures, morning dew or sweat sheen, high-speed shutter aesthetic.",
  'Calm & Intellectual': "Soft diffused interior light, minimalist wooden textures, neutral tones, scholarly atmosphere with soft depth of field."
};

const SYSTEM_INSTRUCTION = `
[CRITICAL PRODUCT FIDELITY REQUIREMENT - 100% REDUCTION]
1. The uploaded eyewear reference image must be reproduced with 100% pixel-accurate fidelity. This is a HARD CONSTRAINT.
2. OPTICAL TRANSPARENCY & LIGHT TRANSMISSION: Strictly maintain the exact transparency, translucency level, and tint of the lenses.
   - If lenses are CLEAR in the reference, they MUST remain perfectly transparent in the output.
   - The model's eyes and the skin behind the lenses must be SHARP, CLEAR, and visible with realistic optical refraction.
   - ZERO tolerance for milky, cloudy, or opaque artifacts on the lenses.
3. PHYSICAL SHADOWS: The eyewear must cast realistic physical shadows on the model's face (bridge of nose, temples). Lenses must show subtle environmental reflections to avoid a "photoshopped sticker" look.
4. No modification of frame shape, materials, or structure.

[DYNAMIC FRAMING & FOCUS PROTOCOL]
- IF Framing is 'Upper Body' or 'Full Body':
  - The eyewear MUST remain the absolute sharpest element in the entire image (Peak Focus).
  - Use background compression (bokeh) to separate subject from environment.
- IF Framing is 'Close-up': Macro focus on frame texture and lens coatings.

Any deviation from the reference eyewear's physical properties is an absolute failure.
`;

const DEVELOPER_PROMPT = `
[TECHNICAL RENDERING STANDARDS]
- Advanced Optical Ray-Tracing: Simulate exact light transmission and refraction.
- PBR (Physically Based Rendering): High-fidelity surface properties for metal, acetate, and glass.
- Commercial Photography Quality: Photorealistic skin texture with natural pores. Tack-sharp focus on the product.
`;

const LIGHTING_INTENT_MAPPING = {
  'Butterfly (Paramount)': 'Top-front key light for symmetrical horizontal rim highlights.',
  'Rembrandt': '45-degree directional light for 3D volume and triangular eye-light.',
  'Rim Light': 'Strong backlighting to create a luminous halo separating edges from background.',
  'Softbox Diffused': 'Wraparound soft box illumination, even gradients.',
  'Neon Noir': 'Dual-tone LED lighting with saturated specular reflections.',
  'Golden Hour': 'Warm low-angle natural light (5600K) for honey-toned highlights.'
};

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 未配置');
  }
  return new GoogleGenAI({ apiKey });
};

export const generateEyewearImage = async (imageBase64, size, modelConfig) => {
  const ai = getAI();
  const model = 'gemini-3-pro-image-preview';

  const atmosphericContext = ATMOSPHERE_ENHANCEMENT[modelConfig.modelVibe] || "";

  let postureInstruction = modelConfig.framing === 'Full Body' || modelConfig.framing === 'Upper Body'
    ? "Dynamic high-fashion pose that emphasizes the eyewear's profile. Editorial interaction with environment."
    : "Natural head tilt, direct eye contact through lenses, hair styled behind ears to show temples.";

  const userPrompt = `
  [PRIMARY SUBJECT — THE PRODUCT]
  - Subject: The Eyewear from the reference image. 100% fidelity.
  - Lens Detail: Absolute clarity, eyes visible through lenses if clear.

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
};

export const generatePosterImage = async (imageBase64, config, size, aspectRatio = '3:4') => {
  const ai = getAI();
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
};

export const getPromptSuggestions = async (mode, imageBase64) => {
  const ai = getAI();

  const parts = [];
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
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (error) {
    console.error("Prompt suggestion error:", error);
    return [
      "极简主义水泥工作室，配合硬朗冷色调光影。",
      "自然午后暖阳，透过绿植形成的斑驳光影。",
      "都市霓虹夜景，带有电影感的蓝橘色调对比。",
      "高端行政走廊，通透大面积玻璃墙与城市远景。",
      "法式复古图书馆，柔和的书卷气与自然漫反射光。"
    ];
  }
};

// 使用模板提示词生成图片
export const generateFromTemplate = async (eyewearImageBase64, templatePrompt, aspectRatio = '3:4') => {
  const ai = getAI();
  const model = 'gemini-3-pro-image-preview';

  const fullPrompt = `
${SYSTEM_INSTRUCTION}

${DEVELOPER_PROMPT}

[TEMPLATE-BASED GENERATION]
使用以下提示词，结合上传的眼镜产品图，生成商业级模特试戴效果图：

${templatePrompt}

[REQUIREMENTS]
- 眼镜必须100%保真还原参考图中的样式
- 镜片透明度和折射效果必须物理正确
- 输出应该是高质量商业摄影效果
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
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }
  throw new Error("TEMPLATE_RENDER_FAILED");
};

// 使用 Gemini Flash 优化提示词（管理员专用）
export const optimizePrompt = async (rawPrompt) => {
  const ai = getAI();
  const model = 'gemini-2.0-flash';  // 使用 Flash 模型进行文本处理

  const systemPrompt = `你是一位专业的商业摄影和 AI 提示词优化专家。你的任务是优化用户提供的提示词，使其更适合生成高质量的眼镜产品试戴效果图。

优化原则：
1. **眼镜还原度**：强调眼镜的精确还原，包括镜框形状、材质、颜色、镜片透明度
2. **专业摄影术语**：添加合适的光线、构图、景深等摄影参数
3. **模特描述**：如果涉及模特，补充自然的表情、姿态、服装搭配
4. **场景氛围**：丰富背景和氛围描述，使画面更有商业感
5. **技术规格**：添加相机、镜头等技术参数以提升专业度

注意事项：
- 保留用户原始意图的核心元素
- 输出应该是纯文本的完整提示词，不要添加解释
- 使用中英文混合，专业术语用英文
- 控制在 200-400 字之间`;

  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { text: `请优化以下眼镜产品摄影的提示词：\n\n${rawPrompt}` }
      ]
    },
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7
    }
  });

  if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
    return response.candidates[0].content.parts[0].text.trim();
  }
  throw new Error("PROMPT_OPTIMIZATION_FAILED");
};
