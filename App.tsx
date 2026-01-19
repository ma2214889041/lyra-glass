
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  AppMode, NavTab, ImageSize, AspectRatio, PosterConfig, 
  PosterRecommendation, CameraFacingMode, GeneratedImage, User, 
  ModelConfig, FramingType, CameraType, LensType, SkinTexture, 
  LightingType, MoodType, PosterLayout, PosterTypography, PosterTone, TypographyIntegration, SetMaterial, EthnicityType 
} from './types';
import { 
  generateEyewearImage, 
  generatePosterImage, 
  ensureApiKey,
  analyzeEyewearAndSuggestScene
} from './services/geminiService';
import { Button } from './components/Button';
import { FeatureCard } from './components/FeatureCard';
import { IconCamera, IconUpload, IconModel, IconCreative, IconPoster, IconGallery } from './components/Icons';

const convertBlobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
};

const LOADING_MESSAGES = [
  "正在构建光路方案...",
  "同步商业级肤质修饰...",
  "物理光学环境检测...",
  "导出 8K 行业级视觉资产..."
];

interface SceneDef {
  id: string;
  displayName: string;
  uiDescription: string;
  promptFragment: string;
  recommendedLighting: LightingType;
  recommendedFraming: FramingType;
}

interface SceneCategory {
  category: string;
  scenes: SceneDef[];
}

const EYEWEAR_SCENES: SceneCategory[] = [
  {
    category: "专业商务",
    scenes: [
      {
        id: "modern_office_window",
        displayName: "现代办公落地窗",
        uiDescription: "柔和自然光，专业感极强的简约空间",
        promptFragment: "A contemporary office interior with floor-to-ceiling windows. Clean architectural lines with minimalist furniture in neutral tones. Soft natural daylight streams through, creating gentle highlights. The background shows a subtle city skyline through the glass. Atmosphere is professional and refined.",
        recommendedLighting: "Softbox Diffused",
        recommendedFraming: "Bust Shot"
      },
      {
        id: "executive_library",
        displayName: "私人图书室",
        uiDescription: "温暖书香氛围，彰显知性气质",
        promptFragment: "An elegant private library with floor-to-ceiling dark wood bookshelves. Warm ambient lighting creates pools of golden light. Rich mahogany furniture and leather-bound books establish a scholarly atmosphere. The mood is intellectual and sophisticated.",
        recommendedLighting: "Golden Hour",
        recommendedFraming: "Close-up"
      }
    ]
  },
  {
    category: "都市时尚",
    scenes: [
      {
        id: "architectural_corridor",
        displayName: "建筑艺术长廊",
        uiDescription: "包豪斯风格，强烈的几何美感",
        promptFragment: "A Bauhaus-inspired architectural corridor with dramatic perspective lines. Exposed concrete walls show natural aggregate texture. Linear skylights create rhythmic patterns of light and shadow. The aesthetic is architectural, modernist, and visually striking.",
        recommendedLighting: "Rim Light",
        recommendedFraming: "Full Body"
      },
      {
        id: "urban_industrial",
        displayName: "工业风街区",
        uiDescription: "原生质感，艺术区氛围感",
        promptFragment: "An urban loft setting with exposed brick walls showing authentic weathering. Industrial metal fixtures create ambient warmth. Large metal-framed windows allow natural light to mix with warm interior lighting. The feeling is artistic and edgy.",
        recommendedLighting: "Neon Noir",
        recommendedFraming: "Bust Shot"
      }
    ]
  },
  {
    category: "休闲度假",
    scenes: [
      {
        id: "coastal_terrace",
        displayName: "海滨露台",
        uiDescription: "温暖日光，度假轻松氛围",
        promptFragment: "A sunlit coastal terrace overlooking the ocean during golden hour. Warm natural light creates a honey-gold quality. Background features a soft-focus seascape. Natural materials like weathered teak and white-washed stone walls establish a Mediterranean luxury vibe.",
        recommendedLighting: "Golden Hour",
        recommendedFraming: "Close-up"
      },
      {
        id: "scandinavian_interior",
        displayName: "北欧极简居室",
        uiDescription: "清冷淡雅，高级简约氛围",
        promptFragment: "A Scandinavian-inspired interior with clean white walls and natural blonde wood flooring. Large windows allow abundant cool daylight. Minimalist furniture in neutral tones creates a serene, refined, and effortlessly sophisticated atmosphere.",
        recommendedLighting: "Softbox Diffused",
        recommendedFraming: "Bust Shot"
      }
    ]
  }
];

const RATIO_LABEL_MAP = { 
  '1:1': '1:1 正方形', 
  '3:4': '3:4 竖屏', 
  '9:16': '9:16 全屏', 
  '16:9': '16:9 宽幅' 
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>(NavTab.CREATE);
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string>('');
  const [imageSize, setImageSize] = useState<ImageSize>('1K');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [recommendedSceneIds, setRecommendedSceneIds] = useState<string[]>([]);
  
  const [posterConfig, setPosterConfig] = useState<PosterConfig>({
    title: 'THE MASTERPIECE',
    subtitle: 'Vision & Art',
    layout: 'Centered',
    typography: 'Classic Serif',
    integration: 'Etched into Material',
    material: 'Brutalist Concrete',
    tone: 'Luxury',
    includeModel: false,
    camera: 'Hasselblad H6D',
    lens: '85mm f/1.4',
    lighting: 'Softbox Diffused',
    mood: 'Natural Soft'
  });

  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    ethnicity: 'East Asian',
    gender: 'Female',
    age: 'Adult',
    scene: EYEWEAR_SCENES[0].scenes[0].promptFragment,
    framing: 'Close-up',
    camera: 'Hasselblad H6D',
    lens: '85mm f/1.4',
    skinTexture: 'Natural Commercial',
    lighting: 'Softbox Diffused',
    mood: 'Natural Soft',
    aspectRatio: '3:4'
  });

  useEffect(() => {
    let interval: any;
    if (isGenerating) {
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % LOADING_MESSAGES.length);
      }, 3000);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  // 当上传底图时，自动分析推荐场景
  useEffect(() => {
    if (imageBase64) {
      analyzeEyewearAndSuggestScene(imageBase64).then(ids => {
        setRecommendedSceneIds(ids);
      });
    }
  }, [imageBase64]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  }, []);

  useEffect(() => {
    let active = true;
    if (isCameraOpen && videoRef.current) {
      const startStream = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
          });
          if (!active) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.error("Camera fail", e));
          }
        } catch (err) {
          setError("无法访问相机");
          setIsCameraOpen(false);
        }
      };
      startStream();
    }
    return () => { active = false; };
  }, [isCameraOpen, facingMode]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        if (facingMode === 'user') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setPreviewUrl(dataUrl);
        setImageBase64(dataUrl.split(',')[1]);
        stopCamera();
        setGeneratedImage(null);
        setMode(AppMode.DASHBOARD);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setPreviewUrl(URL.createObjectURL(file));
      const base64 = await convertBlobToBase64(file);
      setImageBase64(base64);
      setGeneratedImage(null);
      setMode(AppMode.DASHBOARD);
    }
  };

  const handleModeChange = (newMode: AppMode) => {
    setGeneratedImage(null);
    setMode(newMode === AppMode.MODEL_SHOT ? AppMode.MODEL_CONFIG : newMode);
  };

  const renderModelConfig = () => {
    const ethnicityMap: Record<EthnicityType, string> = { 
      'East Asian': '东亚', 'Southeast Asian': '东南亚', 'South Asian': '南亚', 
      'Caucasian': '欧裔', 'Mediterranean': '地中海', 'Scandinavian': '北欧', 
      'African': '非裔', 'Hispanic/Latino': '拉丁裔', 'Middle Eastern': '中东' 
    };
    const lightingMap: Record<LightingType, string> = {
      'Butterfly (Paramount)': '蝴蝶光', 'Rembrandt': '伦勃朗光', 'Rim Light': '轮廓光',
      'Softbox Diffused': '柔光', 'Neon Noir': '霓虹', 'Golden Hour': '自然金时'
    };
    const framingMap: Record<FramingType, string> = { 'Close-up': '特写', 'Bust Shot': '胸像', 'Upper Body': '上半身', 'Full Body': '全身' };

    return (
      <div className="space-y-12 animate-fade-in pb-32 max-w-full lg:max-w-2xl px-1">
        <div className="space-y-3">
           <button onClick={() => setMode(AppMode.DASHBOARD)} className="text-[10px] text-zinc-600 uppercase tracking-widest hover:text-white transition-colors">← 返回</button>
           <h2 className="text-4xl lg:text-5xl font-black italic font-serif text-white">拍摄规格</h2>
           <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.2em]">Commercial Shoot Parameters</p>
        </div>
        
        <div className="space-y-14">
           {/* 场景选择：重构后的分类卡片式布局 */}
           <div className="space-y-10 p-6 lg:p-8 bg-zinc-900/10 rounded-[2.5rem] border border-white/[0.03]">
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-xl text-sky-400 bg-sky-400/10 flex items-center justify-center border border-sky-400/10"><IconCreative /></div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">拍摄场景</h3>
              </div>
              
              <div className="space-y-10">
                {EYEWEAR_SCENES.map(category => (
                  <div key={category.category} className="space-y-4">
                    <label className="text-[9px] text-zinc-600 uppercase tracking-widest font-black">{category.category}</label>
                    <div className="grid grid-cols-1 gap-3">
                      {category.scenes.map(scene => {
                        const isSelected = modelConfig.scene === scene.promptFragment;
                        const isRecommended = recommendedSceneIds.includes(scene.id);
                        return (
                          <button
                            key={scene.id}
                            onClick={() => {
                              setModelConfig({
                                ...modelConfig, 
                                scene: scene.promptFragment,
                                lighting: scene.recommendedLighting,
                                framing: scene.recommendedFraming
                              });
                            }}
                            className={`group p-5 rounded-2xl border transition-all text-left relative ${
                              isSelected
                                ? 'bg-white text-black border-white'
                                : 'bg-zinc-950/40 border-white/5 hover:border-white/20'
                            }`}
                          >
                            {isRecommended && !isSelected && (
                              <div className="absolute top-2 right-4 bg-sky-500/10 text-sky-400 text-[8px] px-2 py-0.5 rounded-full font-black border border-sky-400/20">AI 推荐</div>
                            )}
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex-1 space-y-1">
                                <span className={`text-[11px] font-black uppercase tracking-wide block ${isSelected ? 'text-black' : 'text-white'}`}>
                                  {scene.displayName}
                                </span>
                                <p className={`text-[9px] font-medium leading-relaxed ${isSelected ? 'text-black/60' : 'text-zinc-500'}`}>
                                  {scene.uiDescription}
                                </p>
                              </div>
                              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                                isSelected ? 'border-black bg-black' : 'border-zinc-700 group-hover:border-zinc-500'
                              }`}>
                                {isSelected && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                
                <div className="space-y-3 pt-4 border-t border-white/5">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">自定义场景描述</label>
                  <textarea 
                    value={!EYEWEAR_SCENES.some(cat => cat.scenes.some(s => s.promptFragment === modelConfig.scene)) ? modelConfig.scene : ''} 
                    onChange={(e) => setModelConfig({...modelConfig, scene: e.target.value})} 
                    className="w-full bg-zinc-950 border border-white/5 rounded-2xl px-5 py-4 text-white text-xs font-medium focus:border-white/20 outline-none transition-all resize-none" 
                    placeholder="输入具体的环境、光影及材质描述..." 
                    rows={4}
                  />
                </div>
              </div>
           </div>

           <SelectorGroup title="角色属性" icon={<IconModel />} color="text-white">
              <Selector label="族裔特征" options={Object.keys(ethnicityMap)} current={modelConfig.ethnicity} onChange={(v: any) => setModelConfig(p => ({...p, ethnicity: v}))} labelMap={ethnicityMap} />
              <Selector label="年龄跨度" options={['Child', 'Teenager', 'Youth', 'Adult', 'Mature']} current={modelConfig.age} onChange={(v: any) => setModelConfig(p => ({...p, age: v}))} labelMap={{'Child':'儿童','Teenager':'青少年','Youth':'青年','Adult':'成年','Mature':'成熟'}} />
              <Selector label="肤质表现" options={['High-Fidelity Realism', 'Natural Commercial', 'Soft Glow']} current={modelConfig.skinTexture} onChange={(v: any) => setModelConfig(p => ({...p, skinTexture: v}))} labelMap={{'High-Fidelity Realism':'真实肌理','Natural Commercial':'商业精修','Soft Glow':'通透质感'}} />
           </SelectorGroup>

           <SelectorGroup title="摄影微调" icon={<IconCamera />} color="text-emerald-400">
              <Selector label="光影调节" options={Object.keys(lightingMap)} current={modelConfig.lighting} onChange={(v: any) => setModelConfig(p => ({...p, lighting: v}))} labelMap={lightingMap} />
              <Selector label="构图景别" options={Object.keys(framingMap)} current={modelConfig.framing} onChange={(v: any) => setModelConfig(p => ({...p, framing: v}))} labelMap={framingMap} />
              <Selector label="导出比例" options={Object.keys(RATIO_LABEL_MAP)} current={modelConfig.aspectRatio} onChange={(v: any) => setModelConfig(p => ({...p, aspectRatio: v}))} labelMap={RATIO_LABEL_MAP} />
           </SelectorGroup>

           <div className="pt-4">
             <Button 
                onClick={() => checkKeyAndRun(async () => generateEyewearImage(imageBase64, imageSize, modelConfig), "模特试戴")} 
                className="w-full h-18 rounded-3xl bg-white text-black font-black shadow-[0_20px_50px_rgba(255,255,255,0.1)]" 
                isLoading={isGenerating}
             >
                同步商业渲染
             </Button>
           </div>
        </div>
      </div>
    );
  };

  const renderPosterConfig = () => {
    const layoutMap = { 'Centered': '居中', 'Rule of Thirds': '经典比例', 'Magazine Cover': '杂志画报', 'Minimalist Edge': '留白艺术' };
    const materialMap = { 'Brutalist Concrete': '粗犷水泥', 'White Marble': '纯净大理石', 'Dark Silk': '质感丝绒', 'Raw Basalt': '黑色玄武岩', 'Brushed Aluminum': '现代金属' };

    return (
      <div className="space-y-10 animate-fade-in pb-32 max-w-full lg:max-w-2xl px-1">
        <div className="space-y-3">
           <button onClick={() => setMode(AppMode.DASHBOARD)} className="text-[10px] text-zinc-600 uppercase tracking-widest hover:text-white transition-colors">← 返回</button>
           <h2 className="text-4xl lg:text-5xl font-black italic font-serif text-white">海报生成</h2>
           <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.2em]">Spatial Brand Assets</p>
        </div>

        <div className="space-y-12">
           <div className="bg-zinc-900/20 p-8 rounded-[2.5rem] border border-white/5">
              <div className="space-y-8">
                 <div className="space-y-3">
                   <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">核心文案</label>
                   <input type="text" value={posterConfig.title} onChange={(e) => setPosterConfig({...posterConfig, title: e.target.value})} className="w-full bg-zinc-950 border border-white/5 rounded-2xl px-6 py-5 text-white font-serif italic text-xl focus:border-white/20 outline-none transition-all" />
                 </div>
              </div>
           </div>

           <SelectorGroup title="材质构图" icon={<IconCreative />} color="text-sky-400">
              <Selector label="构图方案" options={Object.keys(layoutMap)} current={posterConfig.layout} onChange={(v: any) => setPosterConfig(p => ({...p, layout: v}))} labelMap={layoutMap} />
              <Selector label="展位材质" options={Object.keys(materialMap)} current={posterConfig.material} onChange={(v: any) => setPosterConfig(p => ({...p, material: v}))} labelMap={materialMap} />
           </SelectorGroup>

           <div className="pt-4">
             <Button onClick={() => checkKeyAndRun(async () => generatePosterImage(imageBase64, posterConfig, imageSize, modelConfig.aspectRatio), "商业海报")} className="w-full h-18 rounded-3xl bg-white text-black font-black shadow-[0_20px_50px_rgba(255,255,255,0.1)]" isLoading={isGenerating}>生成视觉大片</Button>
           </div>
        </div>
      </div>
    );
  };

  const renderPresetStyles = () => {
    const presets: { name: string; desc: string; config: ModelConfig }[] = [
      { name: "大师：侘寂光影", desc: "极致简练的水泥空间，柔和漫反射光", config: { ...modelConfig, scene: EYEWEAR_SCENES[0].scenes[0].promptFragment, mood: "Natural Soft", lighting: "Softbox Diffused" } },
      { name: "大师：日光露台", desc: "暖色调强对比自然光，清晰投影", config: { ...modelConfig, scene: EYEWEAR_SCENES[2].scenes[0].promptFragment, mood: "Natural Soft", lighting: "Golden Hour" } }
    ];

    return (
      <div className="space-y-10 animate-fade-in pb-32 max-w-full lg:max-w-2xl px-1">
        <div className="space-y-3">
           <button onClick={() => setMode(AppMode.DASHBOARD)} className="text-[10px] text-zinc-600 uppercase tracking-widest hover:text-white transition-colors">← 返回</button>
           <h2 className="text-4xl lg:text-5xl font-black italic font-serif text-white">大师方案</h2>
           <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.2em]">Curated Brand Aesthetics</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
           {presets.map(p => (
             <div 
               key={p.name} 
               onClick={() => {
                 setModelConfig(p.config);
                 checkKeyAndRun(async () => generateEyewearImage(imageBase64, imageSize, p.config), `方案-${p.name}`);
               }}
               className="ios-card p-8 flex flex-col justify-between hover:bg-white hover:text-black cursor-pointer group transition-all duration-500"
             >
                <div className="space-y-2">
                  <span className="text-sm font-black uppercase tracking-widest">{p.name}</span>
                  <p className="text-[10px] text-zinc-500 group-hover:text-black/60 font-medium leading-relaxed">{p.desc}</p>
                </div>
                <div className="mt-8 flex justify-end">
                  <div className="w-8 h-8 rounded-full border border-current flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </div>
                </div>
             </div>
           ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col lg:flex-row font-sans overflow-x-hidden">
      <aside className="hidden lg:flex flex-col w-72 bg-zinc-950 border-r border-white/5 h-screen sticky top-0 z-50">
        <div className="p-12 flex items-center gap-3">
          <div className="w-9 h-9 bg-white text-black rounded-xl font-serif font-black flex items-center justify-center text-2xl">L</div>
          <span className="font-black text-2xl font-serif italic text-white">Lyra</span>
        </div>
        <div className="flex-1 px-8 py-4 space-y-2">
          <NavItem active={activeTab === NavTab.CREATE} onClick={() => { setActiveTab(NavTab.CREATE); setMode(AppMode.DASHBOARD); }} icon={<IconCreative />} label="创作中心" />
          <NavItem active={activeTab === NavTab.GALLERY} onClick={() => setActiveTab(NavTab.GALLERY)} icon={<IconGallery />} label="作品集" />
          <div className="pt-12 pb-4 px-4 text-[9px] font-black text-zinc-800 uppercase tracking-widest">最近生成</div>
          <div className="space-y-4 px-2">
             {history.slice(0, 5).map(h => (
               <div key={h.id} className="flex items-center gap-4 cursor-pointer group">
                 <img src={h.url} className="w-11 h-11 rounded-2xl object-cover border border-white/5 grayscale group-hover:grayscale-0 transition-all" />
                 <span className="text-[10px] text-zinc-600 font-bold uppercase group-hover:text-white transition-colors">#{h.id}</span>
               </div>
             ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-screen bg-black">
        <div className="container mx-auto px-6 py-12 lg:px-20 lg:py-20 max-w-7xl">
          {activeTab === NavTab.CREATE && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-16 items-start">
              <div className="xl:col-span-7 space-y-8 lg:sticky lg:top-12">
                <div className="aspect-[3/4] rounded-[3rem] lg:rounded-[4rem] overflow-hidden border border-white/5 bg-[#080808] flex items-center justify-center relative shadow-2xl">
                  {!imageBase64 ? (
                    <div className="p-12 text-center space-y-12">
                       <h1 className="text-5xl lg:text-6xl font-black font-serif italic text-white">眼镜摄影工坊</h1>
                       <div className="flex flex-col gap-4 max-w-xs mx-auto">
                          <Button variant="secondary" onClick={() => setIsCameraOpen(true)} className="rounded-2xl"><IconCamera /> <span className="ml-3">开启相机</span></Button>
                          <Button onClick={() => fileInputRef.current?.click()} className="rounded-2xl"><IconUpload /> <span className="ml-3">上传底图</span></Button>
                          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                       </div>
                    </div>
                  ) : (
                    <>
                      <img src={generatedImage || previewUrl!} className={`max-w-full max-h-full object-contain ${isGenerating ? 'opacity-30 blur-sm' : ''}`} />
                      {isGenerating && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-black/40 backdrop-blur-md px-8 text-center">
                           <div className="w-12 h-12 border-t-2 border-white rounded-full animate-spin"></div>
                           <p className="text-[10px] text-white uppercase tracking-widest font-black animate-pulse leading-loose">{LOADING_MESSAGES[loadingStep]}</p>
                        </div>
                      )}
                      {!isGenerating && !generatedImage && (
                        <button onClick={() => { setPreviewUrl(null); setImageBase64(''); }} className="absolute top-8 right-8 w-12 h-12 rounded-full bg-black/50 backdrop-blur border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="xl:col-span-5">
                {mode === AppMode.DASHBOARD && (
                  <div className="space-y-10">
                    <h2 className="text-4xl lg:text-5xl font-black italic font-serif text-white">创作流</h2>
                    <div className="grid gap-5">
                       <FeatureCard title="模特试戴" description="AI 虚拟渲染，支持全族裔属性与场景参数智能联动" icon={<IconModel />} onClick={() => handleModeChange(AppMode.MODEL_SHOT)} />
                       <FeatureCard title="海报工坊" description="基于物理材质渲染，将产品置于高端陈列环境" icon={<IconPoster />} onClick={() => handleModeChange(AppMode.POSTER_GENERATION)} />
                       <FeatureCard title="大师方案" description="一键应用行业级风格，快速导出高质感资产" icon={<IconCreative />} onClick={() => handleModeChange(AppMode.PRESET_STYLES)} />
                    </div>
                  </div>
                )}
                {mode === AppMode.MODEL_CONFIG && imageBase64 && renderModelConfig()}
                {mode === AppMode.POSTER_GENERATION && imageBase64 && renderPosterConfig()}
                {mode === AppMode.PRESET_STYLES && imageBase64 && renderPresetStyles()}
                {mode === AppMode.RESULT && generatedImage && (
                  <div className="space-y-10 animate-fade-in">
                    <h2 className="text-4xl font-serif italic text-white">渲染已完成</h2>
                    <div className="space-y-4">
                      <Button onClick={() => {
                        const link = document.createElement('a');
                        link.href = generatedImage!;
                        link.download = `eyewear-${Date.now()}.png`;
                        link.click();
                      }} className="w-full h-18 rounded-3xl">保存原图</Button>
                      <Button variant="outline" onClick={() => setMode(AppMode.DASHBOARD)} className="w-full h-18 rounded-3xl">重新渲染</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {isCameraOpen && (
        <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center overflow-hidden">
           <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
           <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-10">
              <button onClick={() => setFacingMode(f => f === 'user' ? 'environment' : 'user')} className="w-14 h-14 rounded-full ios-glass text-white flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 10c0-4.418-3.582-8-8-8s-8 3.582-8 8 3.582 8 8 8c2.187 0 4.168-.881 5.606-2.304l1.894 1.894V10h-7.59l1.894 1.894C12.373 13.313 10.312 14 8 14c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6h2z"/></svg>
              </button>
              <button onClick={capturePhoto} className="w-20 h-20 rounded-full bg-white border-4 border-white/20 active:scale-90 transition-all" />
              <button onClick={stopCamera} className="w-14 h-14 rounded-full ios-glass text-red-500 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
           </div>
           <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
      
      {error && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 ios-glass px-8 py-5 rounded-[2rem] text-red-400 text-xs z-[500] animate-fade-in">{error}</div>}
    </div>
  );

  async function checkKeyAndRun(action: () => Promise<string>, type: string) {
    setIsGenerating(true);
    setError(null);
    try {
      await ensureApiKey();
      const url = await action();
      setGeneratedImage(url);
      setMode(AppMode.RESULT);
      setHistory(prev => [{ id: Math.random().toString(36).substr(2, 4).toUpperCase(), url, type, timestamp: Date.now() }, ...prev]);
    } catch (err: any) {
      if (err?.message?.includes("Requested entity was not found") && window.aistudio) {
        await window.aistudio.openSelectKey();
      }
      setError("渲染繁忙，请稍后重试");
    } finally {
      setIsGenerating(false);
    }
  }
};

const NavItem = ({ active, onClick, icon, label }: any) => (
  <div onClick={onClick} className={`flex items-center gap-5 px-6 py-5 rounded-2xl cursor-pointer transition-all ${active ? 'bg-white text-black font-bold scale-[1.02]' : 'text-zinc-600 hover:text-white hover:bg-white/5'}`}>
    {icon} <span className="text-[10px] tracking-[0.2em] uppercase font-black">{label}</span>
  </div>
);

const SelectorGroup = ({ title, icon, color, children }: any) => (
  <div className="space-y-10 p-6 lg:p-8 bg-zinc-900/10 rounded-[2.5rem] border border-white/[0.03]">
    <div className="flex items-center gap-4">
      <div className={`p-2.5 rounded-xl ${color} bg-opacity-10 flex items-center justify-center border border-current/10`}>{icon}</div>
      <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">{title}</h3>
      <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 to-transparent"></div>
    </div>
    <div className="space-y-12">{children}</div>
  </div>
);

const Selector = ({ label, options, current, onChange, labelMap }: any) => (
  <div className="flex flex-col gap-5">
    <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">{label}</label>
    <div className="flex flex-wrap gap-2.5">
      {options.map((opt: string) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-4 py-3 rounded-2xl text-[10px] font-bold border transition-all ${
            current === opt 
            ? 'bg-white text-black border-white scale-[1.03]' 
            : 'bg-zinc-950/40 text-zinc-500 border-white/5 hover:border-white/20 hover:text-zinc-300'
          }`}
        >
          {labelMap ? (labelMap[opt] || opt) : opt}
        </button>
      ))}
    </div>
  </div>
);

export default App;
