
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
  ensureApiKey 
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
  "正在构建专业人像轮廓...",
  "同步商业级肤质精修方案...",
  "模拟真实物理光学环境...",
  "输出 8K 行业级视觉资产..."
];

const EYEWEAR_SCENES = [
  {
    name: "影棚/纯净",
    items: ["侘寂风水泥空间", "极简无缝白墙", "质感磨砂灰幕", "现代艺术画廊"]
  },
  {
    name: "建筑/时尚",
    items: ["极简主义长廊", "玻璃幕墙中庭", "包豪斯风格建筑", "米兰街头建筑"]
  },
  {
    name: "自然/空间",
    items: ["北欧极简居室", "日光盈盈的露台", "清晨柔光森林", "高级感私人书室"]
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
    scene: '侘寂风水泥空间',
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
            videoRef.current.play().catch(e => console.error("相机连接失败", e));
          }
        } catch (err) {
          setError("无法访问相机设备");
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
      'Caucasian': '欧裔/白人', 'Mediterranean': '地中海', 'Scandinavian': '北欧', 
      'African': '非裔', 'Hispanic/Latino': '拉丁裔', 'Middle Eastern': '中东' 
    };
    const lightingMap: Record<LightingType, string> = {
      'Butterfly (Paramount)': '蝴蝶光 (人像)', 'Rembrandt': '伦勃朗光 (质感)', 'Rim Light': '轮廓光 (立体)',
      'Softbox Diffused': '柔光 (专业)', 'Neon Noir': '霓虹氛围', 'Golden Hour': '自然金时'
    };
    const framingMap: Record<FramingType, string> = { 'Close-up': '近景特写', 'Bust Shot': '标准胸像', 'Upper Body': '上半身', 'Full Body': '全身展示' };

    return (
      <div className="space-y-12 animate-fade-in pb-32 max-w-full lg:max-w-2xl px-1">
        <div className="space-y-3">
           <button onClick={() => setMode(AppMode.DASHBOARD)} className="text-[10px] text-zinc-600 uppercase tracking-widest hover:text-white transition-colors">← 返回</button>
           <h2 className="text-4xl lg:text-5xl font-black italic font-serif text-white">模特试戴</h2>
           <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.2em]">Commercial Portrait Synthesis</p>
        </div>
        
        <div className="space-y-14">
           {/* 模特基础 */}
           <SelectorGroup title="角色设置" icon={<IconModel />} color="text-white">
              <Selector label="族裔选择" options={Object.keys(ethnicityMap)} current={modelConfig.ethnicity} onChange={(v: any) => setModelConfig(p => ({...p, ethnicity: v}))} labelMap={ethnicityMap} />
              <Selector label="年龄跨度" options={['Child', 'Teenager', 'Youth', 'Adult', 'Mature']} current={modelConfig.age} onChange={(v: any) => setModelConfig(p => ({...p, age: v}))} labelMap={{'Child':'儿童','Teenager':'青少年','Youth':'青年','Adult':'成年','Mature':'成熟'}} />
              <Selector label="皮肤表现" options={['High-Fidelity Realism', 'Natural Commercial', 'Soft Glow']} current={modelConfig.skinTexture} onChange={(v: any) => setModelConfig(p => ({...p, skinTexture: v}))} labelMap={{'High-Fidelity Realism':'真实肌理','Natural Commercial':'商业精修','Soft Glow':'通透质感'}} />
           </SelectorGroup>

           {/* 场景选择 */}
           <div className="space-y-10 p-6 lg:p-8 bg-zinc-900/10 rounded-[2.5rem] border border-white/[0.03]">
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-xl text-sky-400 bg-sky-400/10 flex items-center justify-center border border-sky-400/10"><IconCreative /></div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">场景预设</h3>
              </div>
              
              <div className="space-y-8">
                {EYEWEAR_SCENES.map(cat => (
                  <div key={cat.name} className="space-y-3">
                    <label className="text-[9px] text-zinc-600 uppercase tracking-widest font-black">{cat.name}</label>
                    <div className="flex flex-wrap gap-2">
                      {cat.items.map(s => (
                        <button 
                          key={s} 
                          onClick={() => setModelConfig({...modelConfig, scene: s})}
                          className={`px-3 py-2 rounded-xl text-[9px] font-bold border transition-all ${modelConfig.scene === s ? 'bg-white text-black border-white' : 'bg-zinc-950/40 text-zinc-500 border-white/5'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                
                <div className="space-y-3">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">自定义场景</label>
                  <input 
                    type="text" 
                    value={modelConfig.scene} 
                    onChange={(e) => setModelConfig({...modelConfig, scene: e.target.value})} 
                    className="w-full bg-zinc-950 border border-white/5 rounded-2xl px-5 py-4 text-white text-xs font-medium focus:border-white/20 outline-none transition-all" 
                    placeholder="输入具体拍摄地点描述..." 
                  />
                </div>
              </div>
           </div>

           {/* 拍摄参数 */}
           <SelectorGroup title="摄影规格" icon={<IconCamera />} color="text-emerald-400">
              <Selector label="光效方案" options={Object.keys(lightingMap)} current={modelConfig.lighting} onChange={(v: any) => setModelConfig(p => ({...p, lighting: v}))} labelMap={lightingMap} />
              <Selector label="景别构图" options={Object.keys(framingMap)} current={modelConfig.framing} onChange={(v: any) => setModelConfig(p => ({...p, framing: v}))} labelMap={framingMap} />
              <Selector label="比例" options={Object.keys(RATIO_LABEL_MAP)} current={modelConfig.aspectRatio} onChange={(v: any) => setModelConfig(p => ({...p, aspectRatio: v}))} labelMap={RATIO_LABEL_MAP} />
           </SelectorGroup>

           <div className="pt-4">
             <Button 
                onClick={() => checkKeyAndRun(async () => generateEyewearImage(imageBase64, imageSize, modelConfig), "模特试戴")} 
                className="w-full h-18 rounded-3xl bg-white text-black font-black shadow-[0_20px_50px_rgba(255,255,255,0.1)]" 
                isLoading={isGenerating}
             >
                渲染拍摄预览
             </Button>
           </div>
        </div>
      </div>
    );
  };

  const renderPosterConfig = () => {
    const layoutMap = { 'Centered': '平衡居中', 'Rule of Thirds': '经典比例', 'Magazine Cover': '杂志画报', 'Minimalist Edge': '留白艺术' };
    const materialMap = { 'Brutalist Concrete': '粗犷水泥', 'White Marble': '纯净大理石', 'Dark Silk': '质感丝绒', 'Raw Basalt': '黑色玄武岩', 'Brushed Aluminum': '现代金属' };

    return (
      <div className="space-y-10 animate-fade-in pb-32 max-w-full lg:max-w-2xl px-1">
        <div className="space-y-3">
           <button onClick={() => setMode(AppMode.DASHBOARD)} className="text-[10px] text-zinc-600 uppercase tracking-widest hover:text-white transition-colors">← 返回</button>
           <h2 className="text-4xl lg:text-5xl font-black italic font-serif text-white">海报渲染</h2>
           <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.2em]">High-End Brand Visuals</p>
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

           <SelectorGroup title="版面材质" icon={<IconCreative />} color="text-sky-400">
              <Selector label="构图" options={Object.keys(layoutMap)} current={posterConfig.layout} onChange={(v: any) => setPosterConfig(p => ({...p, layout: v}))} labelMap={layoutMap} />
              <Selector label="展位材质" options={Object.keys(materialMap)} current={posterConfig.material} onChange={(v: any) => setPosterConfig(p => ({...p, material: v}))} labelMap={materialMap} />
           </SelectorGroup>

           <div className="pt-4">
             <Button onClick={() => checkKeyAndRun(async () => generatePosterImage(imageBase64, posterConfig, imageSize, modelConfig.aspectRatio), "商业海报")} className="w-full h-18 rounded-3xl bg-white text-black font-black shadow-[0_20px_50px_rgba(255,255,255,0.1)]" isLoading={isGenerating}>渲染海报大片</Button>
           </div>
        </div>
      </div>
    );
  };

  const renderPresetStyles = () => {
    const presets = [
      { name: "侘寂光影", desc: "极简水泥空间，柔和漫反射光", config: { ...modelConfig, scene: "侘寂风水泥空间", mood: "Natural Soft", lighting: "Softbox Diffused" } },
      { name: "地中海日光", desc: "温暖日光，清晰的投影质感", config: { ...modelConfig, scene: "地中海日光露台", mood: "Natural Soft", lighting: "Golden Hour" } },
      { name: "艺术展厅", desc: "冷调高级感，专业展陈光效", config: { ...modelConfig, scene: "现代艺术画廊", mood: "High-Key Clean", lighting: "Softbox Diffused" } }
    ];

    return (
      <div className="space-y-10 animate-fade-in pb-32 max-w-full lg:max-w-2xl px-1">
        <div className="space-y-3">
           <button onClick={() => setMode(AppMode.DASHBOARD)} className="text-[10px] text-zinc-600 uppercase tracking-widest hover:text-white transition-colors">← 返回</button>
           <h2 className="text-4xl lg:text-5xl font-black italic font-serif text-white">大师预设</h2>
           <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.2em]">Premium Scene Pre-sets</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
           {presets.map(p => (
             <div 
               key={p.name} 
               onClick={() => {
                 setModelConfig(p.config);
                 checkKeyAndRun(async () => generateEyewearImage(imageBase64, imageSize, p.config), `预设-${p.name}`);
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
          <NavItem active={activeTab === NavTab.GALLERY} onClick={() => setActiveTab(NavTab.GALLERY)} icon={<IconGallery />} label="画廊" />
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
                          <Button variant="secondary" onClick={() => setIsCameraOpen(true)} className="rounded-2xl"><IconCamera /> <span className="ml-3">相机拍摄</span></Button>
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
                       <FeatureCard title="模特试戴" description="AI 驱动的虚拟人像渲染，支持多种预设场景与模特配置" icon={<IconModel />} onClick={() => handleModeChange(AppMode.MODEL_SHOT)} />
                       <FeatureCard title="海报工坊" description="空间化材质渲染，将产品置于艺术级陈列环境" icon={<IconPoster />} onClick={() => handleModeChange(AppMode.POSTER_GENERATION)} />
                       <FeatureCard title="大师预设" description="一键应用专业光影方案，快速导出高质感视觉资产" icon={<IconCreative />} onClick={() => handleModeChange(AppMode.PRESET_STYLES)} />
                    </div>
                  </div>
                )}
                {mode === AppMode.MODEL_CONFIG && imageBase64 && renderModelConfig()}
                {mode === AppMode.POSTER_GENERATION && imageBase64 && renderPosterConfig()}
                {mode === AppMode.PRESET_STYLES && imageBase64 && renderPresetStyles()}
                {mode === AppMode.RESULT && generatedImage && (
                  <div className="space-y-10 animate-fade-in">
                    <h2 className="text-4xl font-serif italic text-white">资产已就绪</h2>
                    <div className="space-y-4">
                      <Button onClick={() => {
                        const link = document.createElement('a');
                        link.href = generatedImage!;
                        link.download = `eyewear-${Date.now()}.png`;
                        link.click();
                      }} className="w-full h-18 rounded-3xl">保存高分辨率图像</Button>
                      <Button variant="outline" onClick={() => setMode(AppMode.DASHBOARD)} className="w-full h-18 rounded-3xl">返回仪表盘</Button>
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
      setError("渲染引擎正忙，请稍后重试");
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
