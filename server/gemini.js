import { GoogleGenAI } from "@google/genai";

const ATMOSPHERE_ENHANCEMENT = {
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


const LIGHTING_INTENT_MAPPING = {
  'Butterfly (Paramount)': 'Top-front key light for symmetrical horizontal rim highlights.',
  'Rembrandt': '45-degree directional light for 3D volume and triangular eye-light.',
  'Rim Light': 'Strong backlighting to create a luminous halo separating edges from background.',
  'Softbox Diffused': 'Wraparound soft box illumination, even gradients.',
  'Neon Noir': 'Dual-tone LED lighting with saturated specular reflections.',
  'Golden Hour': 'Warm low-angle natural light (5600K) for honey-toned highlights.'
};

const GENDER_MODEL_SPECS = {
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

const getAI = async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 未配置');
  }

  const config = { apiKey };

  // 如果配置了代理（用于中国大陆访问）
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    console.log(`🌐 使用代理访问 Gemini API: ${proxyUrl}`);

    try {
      // 动态导入代理模块（避免强制依赖）
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      const agent = new HttpsProxyAgent(proxyUrl);
      config.httpAgent = agent;
      config.httpsAgent = agent;
    } catch (error) {
      console.warn('⚠️ 代理模块未安装，请运行: npm install https-proxy-agent');
      console.warn('⚠️ 将直接连接 Gemini API（中国大陆可能无法访问）');
    }
  }

  return new GoogleGenAI(config);
};

export const generateEyewearImage = async (imageBase64, size, modelConfig, gender = 'female') => {
  const ai = await getAI();
  const model = 'gemini-3-pro-image-preview';

  const atmosphericContext = ATMOSPHERE_ENHANCEMENT[modelConfig.modelVibe] || "";
  const genderSpec = GENDER_MODEL_SPECS[gender] || GENDER_MODEL_SPECS.female;

  let postureInstruction = modelConfig.framing === 'Full Body' || modelConfig.framing === 'Upper Body'
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
};

export const generatePosterImage = async (imageBase64, config, size, aspectRatio = '3:4') => {
  const ai = await getAI();
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
  const ai = await getAI();

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
  const ai = await getAI();
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

        // 验证数据
        if (!base64Data || base64Data.length < 100) {
          console.error('❌ Gemini 返回的图片数据太小或为空');
          console.error('数据长度:', base64Data?.length || 0);
          throw new Error("INVALID_IMAGE_DATA_TOO_SMALL");
        }

        console.log(`✅ Gemini 返回图片数据大小: ${(base64Data.length / 1024).toFixed(2)} KB`);
        return `data:image/png;base64,${base64Data}`;
      }
    }
  }

  console.error('❌ Gemini 响应中没有图片数据');
  console.error('Response:', JSON.stringify(response, null, 2).substring(0, 500));
  throw new Error("TEMPLATE_RENDER_FAILED");
};

// 使用 Gemini Flash 优化提示词（管理员专用）- 同时生成男女两个版本 + 名称描述
export const optimizePrompt = async (rawPrompt) => {
  const ai = await getAI();
  const model = 'gemini-3-flash-preview';

  const systemPrompt = `You are a prompt adapter for eyewear photography. Your task is to make MINIMAL changes to the user's prompt.

[CRITICAL RULES]

1. TREAT INPUT AS RAW STRING - DO NOT CHANGE FORMAT
   - Treat the ENTIRE input as a raw string, whether it's JSON, plain text, or any other format
   - DO NOT parse, restructure, or reformat the input
   - DO NOT extract fields or flatten JSON - keep the EXACT original format
   - Only INSERT or REPLACE specific text content within the original string
   - Keep ALL original formatting, structure, quotes, brackets, parameters EXACTLY as-is
   - Keep ALL scene descriptions, lighting, composition, camera settings unchanged
   - Keep ALL mood, atmosphere, color grading unchanged
   - DO NOT add new details the user didn't specify
   - DO NOT rewrite or "improve" the prompt beyond the required insertions

2. EYEWEAR FIDELITY (CRITICAL - ALWAYS REQUIRED)
   - REGARDLESS of whether the original prompt mentions eyewear or not, you MUST add eyewear instruction
   - ALWAYS include this statement: "Model wearing the eyewear/sunglasses from the reference image with 100% fidelity - exact frame shape, color, material, and lens tint must be reproduced exactly as shown in the reference"
   - If original prompt mentions glasses/sunglasses/眼镜/墨镜: replace that mention with the above fidelity statement
   - If original prompt does NOT mention any eyewear: add the above fidelity statement at the beginning
   - This is NON-NEGOTIABLE - every generated prompt MUST include eyewear reproduction instruction

3. SKIN QUALITY (ALWAYS INCLUDE - KEEP IT SHORT)
   - ALWAYS add skin quality instruction to every prompt
   - Required statement: "Realistic healthy skin with natural texture and visible pores, authentic and lifelike, NOT artificial or plastic or ceramic"
   - Keep it SHORT - only use 3 core negative terms: artificial, plastic, ceramic
   - DO NOT list many negative terms - it makes the prompt too long and redundant

4. CLOTHING MODESTY (ONLY FOR OVERLY REVEALING CLOTHES)
   - ONLY modify clothing if it is overly revealing/exposed
     * Revealing bikini → stylish swimwear with cover-up
     * Low-cut/deep neckline → elegant neckline
     * Very short skirts → appropriate length
   - DO NOT change poses or body language - keep the original sexy/seductive poses if present
   - DO NOT change expressions - keep sultry, seductive, alluring expressions as-is
   - Keep the original mood and sensuality, only cover up exposed skin/clothing

5. GENDER ADAPTATION - SMART CLOTHING MATCHING
   - Create TWO versions: female and male
   - For male version: DO NOT default to suits/formal wear
     * Instead, ANALYZE the female version's atmosphere and scene
     * Choose male clothing that matches the SAME VIBE and SCENE appropriately
     * Examples:
       - Beach/casual → linen shirt, shorts, sandals (not suit)
       - Sporty/athletic → athletic wear, sneakers (not suit)
       - Artistic/creative → relaxed blazer, turtleneck, creative styling (not formal suit)
       - Luxury/elegant → well-tailored casual luxury, designer pieces
       - Street/urban → streetwear, trendy casual (not suit)
       - Professional/office → then suit is appropriate
     * Match the footwear to the scene (sandals, sneakers, loafers, etc. - not always dress shoes)
   - For female version: maintain original styling direction
   - Keep the SAME energy, mood, and scene concept between genders

6. USE PLACEHOLDERS FOR USER SELECTION
   - Use {{ethnicity}} for model ethnicity (user will select: East Asian, Caucasian, etc.)
   - Use {{age}} for age group (user will select: Youth, Adult, Mature, etc.)
   - Example: "{{ethnicity}} {{age}} female model..."

7. GENERATE TEMPLATE METADATA
   - name: Short Chinese name (2-6 chars) like "都市精英", "海滩假日"
   - description: Chinese description (10-30 chars)
   - defaultGender: 'male' or 'female' based on original prompt's vibe
   - defaultFraming: 'Close-up', 'Upper Body', or 'Full Body' based on prompt

[OUTPUT FORMAT]
Return ONLY valid JSON:
{
  "name": "模板名称",
  "description": "模板描述",
  "defaultGender": "female",
  "defaultFraming": "Close-up",
  "female": "MINIMALLY modified prompt for female...",
  "male": "MINIMALLY modified prompt for male..."
}

[EXAMPLE 1 - Professional Scene]
Input: "Professional woman in elegant black dress, soft office lighting, confident pose"

Output:
{
  "name": "职场精英",
  "description": "专业自信的职场形象照",
  "defaultGender": "female",
  "defaultFraming": "Upper Body",
  "female": "{{ethnicity}} {{age}} female model wearing the reference eyewear with 100% fidelity. Professional woman in elegant black dress, soft office lighting, confident pose",
  "male": "{{ethnicity}} {{age}} male model wearing the reference eyewear with 100% fidelity. Professional man in tailored dark suit, soft office lighting, confident pose"
}

[EXAMPLE 2 - Casual Beach Scene]
Input: "Stylish woman in flowing summer dress, golden hour beach, relaxed vacation mood"

Output:
{
  "name": "海滩假日",
  "description": "轻松惬意的度假风格",
  "defaultGender": "female",
  "defaultFraming": "Full Body",
  "female": "{{ethnicity}} {{age}} female model wearing the reference sunglasses with 100% fidelity. Stylish woman in flowing summer dress, golden hour beach, relaxed vacation mood",
  "male": "{{ethnicity}} {{age}} male model wearing the reference sunglasses with 100% fidelity. Stylish man in linen shirt and light shorts, leather sandals, golden hour beach, relaxed vacation mood"
}

[EXAMPLE 3 - Clothing Modesty Only - Keep Poses]
Input: "Seductive woman in revealing bikini, provocative pose, bedroom eyes"

Output:
{
  "name": "夏日风情",
  "description": "性感夏日泳装风格",
  "defaultGender": "female",
  "defaultFraming": "Upper Body",
  "female": "{{ethnicity}} {{age}} female model wearing the reference sunglasses with 100% fidelity. Seductive woman in stylish swimwear with cover-up, provocative pose, bedroom eyes. Realistic healthy skin with natural texture, authentic and lifelike, NOT artificial or plastic or ceramic.",
  "male": "{{ethnicity}} {{age}} male model wearing the reference sunglasses with 100% fidelity. Attractive man in stylish swim shorts, provocative pose, smoldering eyes. Realistic healthy skin with natural texture, authentic and lifelike, NOT artificial or plastic or ceramic."
}

[EXAMPLE 4 - JSON Input - KEEP EXACT FORMAT, ONLY MODIFY TEXT INSIDE]
Input: {"description":"Ultra-photorealistic glamour portrait of woman in black gown, seductive pose, low neckline","parameters":{"aspect_ratio":"9:16","steps":50,"cfg_scale":9.5,"style":"Photorealistic"}}

Output:
{
  "name": "黑裙优雅",
  "description": "高端时尚黑裙人像",
  "defaultGender": "female",
  "defaultFraming": "Full Body",
  "female": "{\"description\":\"{{ethnicity}} {{age}} female model wearing the eyewear/sunglasses from the reference image with 100% fidelity. Ultra-photorealistic glamour portrait of woman in elegant black gown, sophisticated pose. Realistic healthy skin with natural texture, authentic and lifelike, NOT artificial or plastic or ceramic.\",\"parameters\":{\"aspect_ratio\":\"9:16\",\"steps\":50,\"cfg_scale\":9.5,\"style\":\"Photorealistic\"}}",
  "male": "{\"description\":\"{{ethnicity}} {{age}} male model wearing the eyewear/sunglasses from the reference image with 100% fidelity. Ultra-photorealistic glamour portrait of man in tailored black suit, sophisticated pose. Realistic healthy skin with natural texture, authentic and lifelike, NOT artificial or plastic or ceramic.\",\"parameters\":{\"aspect_ratio\":\"9:16\",\"steps\":50,\"cfg_scale\":9.5,\"style\":\"Photorealistic\"}}"
}

Notice:
- JSON input → OUTPUT KEEPS THE SAME JSON STRUCTURE (as escaped string)
- All parameters preserved exactly: aspect_ratio, steps, cfg_scale, style
- Only the description TEXT is modified (add eyewear, skin, de-sexualize, gender adapt)
- female/male are strings containing the full JSON (with escaped quotes)`;

  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { text: `ADAPT this prompt with MINIMAL changes (preserve 95% of original). Only modify for gender and add eyewear integration if missing:\n\n${rawPrompt}` }
      ]
    },
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      temperature: 0.2  // Lower temperature for more consistent, minimal changes
    }
  });

  if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
    const text = response.candidates[0].content.parts[0].text.trim();
    try {
      return JSON.parse(text);
    } catch (e) {
      return { female: text, male: null, defaultGender: 'female', defaultFraming: 'Close-up' };
    }
  }
  throw new Error("PROMPT_OPTIMIZATION_FAILED");
};
