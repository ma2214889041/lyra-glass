
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  AppMode, NavTab, ImageSize, AspectRatio, PosterConfig, 
  CameraFacingMode, GeneratedImage, 
  ModelConfig, FramingType, EyewearCategory, ClothingStyle, PoseStyle, HandAction, EthnicityType, LightingType
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
  category: EyewearCategory[];
}

const EYEWEAR_SCENES: SceneDef[] = [
  {
    id: "modern_office",
    displayName: "现代办公落地窗",
    uiDescription: "柔和自然光，专业感极强的简约空间",
    promptFragment: "A contemporary corner office with floor-to-ceiling windows revealing an urban skyline. Interior features pristine white walls, charcoal gray polished concrete floors, and minimalist furniture. Natural daylight floods from the southwest creating soft directional illumination.",
    recommendedLighting: "Softbox Diffused",
    recommendedFraming: "Bust Shot",
    category: ["Fashion Optical", "Luxury"]
  },
  {
    id: "executive_library",
    displayName: "私人图书室",
    uiDescription: "温暖书香氛围，彰显知性气质",
    promptFragment: "Intimate private library with floor-to-ceiling dark walnut bookshelves. Mahogany reading desk with warm wood patina and a green-shaded banker's lamp. Natural afternoon sunlight diffuses through sheer linen curtains.",
    recommendedLighting: "Golden Hour",
    recommendedFraming: "Close-up",
    category: ["Fashion Optical", "Vintage"]
  },
  {
    id: "coastal_terrace",
    displayName: "海滨露台",
    uiDescription: "地中海日光，极致度假美学",
    promptFragment: "Mediterranean terrace overlooking turquoise ocean during golden hour. Sun-bleached teak decking, white-washed stone walls glowing with amber light. The sky transitions from orange to lavender.",
    recommendedLighting: "Golden Hour",
    recommendedFraming: "Close-up",
    category: ["Sunglasses", "Luxury"]
  },
  {
    id: "urban_loft",
    displayName: "工业风街区",
    uiDescription: "原生砖石质感，都市前卫风格",
    promptFragment: "Authentic urban loft with exposed red brick walls and large steel-framed windows. Raw wooden ceiling joists and polished concrete floors reflect warm amber glow from vintage Edison bulbs.",
    recommendedLighting: "Neon Noir",
    recommendedFraming: "Bust Shot",
    // Fix: changed "Street" to "Sunglasses" to match EyewearCategory type
    category: ["Fashion Optical", "Sunglasses"]
  },
  {
    id: "gym_modern",
    displayName: "现代健身房",
    uiDescription: "专业动态空间，彰显活力能量",
    promptFragment: "Modern minimalist gym with high-tech equipment in soft focus. Bright LED studio lighting provides clean even illumination. Non-slip charcoal rubber flooring showing subtle texture.",
    recommendedLighting: "Softbox Diffused",
    recommendedFraming: "Upper Body",
    category: ["Sports"]
  },
  {
    id: "retro_bar",
    displayName: "复古爵士吧",
    uiDescription: "怀旧电影感，经典的皮质与胡桃木",
    promptFragment: "Deep walnut wood paneling and aged leather booths. Warm tungsten lighting creates dramatic shadows. A slight haze in the air adds cinematic depth. Brass accents catch subtle glints.",
    recommendedLighting: "Rembrandt",
    recommendedFraming: "Bust Shot",
    category: ["Vintage", "Luxury"]
  }
];

const RATIO_MAP: Record<AspectRatio, string> = { 
  '1:1': '1:1 (社交贴图)', '3:4': '3:4 (电商详情)', '9:16': '9:16 (全屏/Stories)', '16:9': '16:9 (Banner)', '4:3': '4:3 (标准肖像)' 
};

const FRAMING_ICONS: Record<FramingType, React.ReactNode> = {
  'Close-up': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><rect x="4" y="2" width="16" height="20" rx="2" strokeDasharray="2 2"/></svg>,
  'Bust Shot': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/><path d="M19 14v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-1"/><rect x="4" y="1" width="16" height="22" rx="2" strokeDasharray="2 2"/></svg>,
  'Upper Body': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M12 6v8"/><path d="M8 8h8"/><rect x="3" y="1" width="18" height="18" rx="2" strokeDasharray="2 2"/></svg>,
  'Full Body': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M12 6v10"/><path d="M6 9l6-2 6 2"/><rect x="2" y="1" width="20" height="22" rx="2" strokeDasharray="2 2"/></svg>
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
  
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    category: 'Fashion Optical',
    clothingStyle: 'Business',
    poseStyle: 'Professional',
    handAction: 'None',
    ethnicity: 'East Asian',
    gender: 'Female',
    scene: EYEWEAR_SCENES[0].promptFragment,
    framing: 'Close-up',
    camera: 'Hasselblad H6D',
    lens: '85mm f/1.4',
    skinTexture: 'Natural Commercial',
    lighting: 'Softbox Diffused',
    mood: 'Natural Soft',
    aspectRatio: '3:4'
  });

  const [posterConfig, setPosterConfig] = useState<PosterConfig>({
    title: 'THE VISIONARY', subtitle: 'Autumn/Winter 25', layout: 'Centered',
    typography: 'Classic Serif', integration: 'Etched into Material',
    material: 'Brutalist Concrete', tone: 'Luxury', includeModel: false,
    camera: 'Hasselblad H6D', lens: '85mm f/1.4', lighting: 'Softbox Diffused', mood: 'Natural Soft'
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
        if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
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

  const renderModelConfig = () => {
    const categoryMap: Record<EyewearCategory, string> = { 'Fashion Optical': '光学镜', 'Sunglasses': '太阳镜', 'Sports': '运动镜', 'Vintage': '复古镜', 'Luxury': '奢侈品' };
    const clothingMap: Record<ClothingStyle, string> = { 'Business': '商务', 'Casual': '休闲', 'Luxury': '奢华', 'Resort': '度假', 'Street': '街头', 'Sporty': '运动', 'Vintage': '复古', 'Minimalist': '极简' };
    const poseMap: Record<PoseStyle, string> = { 'Professional': '专业', 'Relaxed': '轻松', 'Avant-Garde': '前卫', 'Dynamic': '动态', 'Elegant': '优雅' };
    const actionMap: Record<HandAction, string> = { 'None': '无动作', 'Adjusting Glasses': '调整镜架', 'Touching Hair': '撩拨头发', 'Thinking': '托腮思考', 'Touching Frame': '轻触镜框', 'Crossing Arms': '双手抱胸' };
    const ethnicityMap: Record<EthnicityType, string> = { 'East Asian': '东亚', 'Southeast Asian': '东南亚', 'South Asian': '南亚', 'Caucasian': '欧裔', 'African': '非裔', 'Hispanic/Latino': '拉丁裔', 'Mediterranean': '地中海', 'Scandinavian': '北欧', 'Middle Eastern': '中东' };
    const skinMap: Record<string, string> = { 'High-Fidelity Realism': '极致真实', 'Natural Commercial': '商业精修', 'Soft Glow': '柔和通透' };

    return (
      <div className="space-y-12 animate-fade-in pb-32 max-w-full lg:max-w-2xl px-1">
        <div className="space-y-3">
           <button onClick={() => setMode(AppMode.DASHBOARD)} className="text-[10px] text-zinc-600 uppercase tracking-widest hover:text-white transition-colors">← 返回</button>
           <h2 className="text-4xl lg:text-5xl font-black italic font-serif text-white">拍摄中心</h2>
           <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.2em]">Product Categorization & Visual Directing</p>
        </div>

        <div className="space-y-14">
           {/* 第一步：产品分类 */}
           <SelectorGroup title="1. 产品分类 (定位核心)" icon={<IconCreative />} color="text-sky-400">
              <Selector label="眼镜类型" options={Object.keys(categoryMap)} current={modelConfig.category} onChange={(v: any) => setModelConfig(p => ({...p, category: v}))} labelMap={categoryMap} />
           </SelectorGroup>

           {/* 第二步：拍摄环境 */}
           <div className="space-y-10 p-6 lg:p-8 bg-zinc-900/10 rounded-[2.5rem] border border-white/[0.03]">
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-xl text-amber-400 bg-amber-400/10 flex items-center justify-center border border-amber-400/10"><IconGallery /></div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">2. 拍摄环境 (视觉语境)</h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {EYEWEAR_SCENES.filter(s => s.category.includes(modelConfig.category) || modelConfig.category === 'Luxury').map(scene => {
                  const isSelected = modelConfig.scene === scene.promptFragment;
                  return (
                    <div key={scene.id} onClick={() => setModelConfig({...modelConfig, scene: scene.promptFragment, lighting: scene.recommendedLighting, framing: scene.recommendedFraming})} className={`p-5 rounded-2xl border cursor-pointer transition-all ${isSelected ? 'bg-white text-black border-white' : 'bg-zinc-950/40 border-white/5 hover:border-white/10'}`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-[11px] font-black uppercase tracking-wide ${isSelected ? 'text-black' : 'text-zinc-200'}`}>{scene.displayName}</span>
                        {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <p className={`text-[9px] mt-1 ${isSelected ? 'text-black/60' : 'text-zinc-500'}`}>{scene.uiDescription}</p>
                    </div>
                  );
                })}
              </div>
           </div>

           {/* 第三步：造型配置 */}
           <SelectorGroup title="3. 造型与姿态 (品牌细节)" icon={<IconModel />} color="text-purple-400">
              <Selector label="服装风格" options={Object.keys(clothingMap)} current={modelConfig.clothingStyle} onChange={(v: any) => setModelConfig(p => ({...p, clothingStyle: v}))} labelMap={clothingMap} />
              <Selector label="姿态风格" options={Object.keys(poseMap)} current={modelConfig.poseStyle} onChange={(v: any) => setModelConfig(p => ({...p, poseStyle: v}))} labelMap={poseMap} />
              <Selector label="手部动作" options={Object.keys(actionMap)} current={modelConfig.handAction} onChange={(v: any) => setModelConfig(p => ({...p, handAction: v}))} labelMap={actionMap} />
           </SelectorGroup>

           {/* 第四步：人物特征 */}
           <SelectorGroup title="4. 模特参数 (目标客群)" icon={<IconModel />} color="text-white">
              <Selector label="族裔" options={Object.keys(ethnicityMap)} current={modelConfig.ethnicity} onChange={(v: any) => setModelConfig(p => ({...p, ethnicity: v}))} labelMap={ethnicityMap} />
              <Selector label="肤质" options={Object.keys(skinMap)} current={modelConfig.skinTexture} onChange={(v: any) => setModelConfig(p => ({...p, skinTexture: v}))} labelMap={skinMap} />
           </SelectorGroup>

           {/* 第五步：摄影微调 */}
           <div className="space-y-10 p-6 lg:p-8 bg-zinc-900/10 rounded-[2.5rem] border border-white/[0.03]">
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-xl text-emerald-400 bg-emerald-400/10 flex items-center justify-center border border-emerald-400/10"><IconCamera /></div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">5. 摄影参数 (专业输出)</h3>
              </div>
              <div className="space-y-8">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['Close-up', 'Bust Shot', 'Upper Body', 'Full Body'] as FramingType[]).map(f => (
                    <button key={f} onClick={() => setModelConfig({...modelConfig, framing: f})} className={`p-4 rounded-2xl border flex flex-col items-center gap-3 transition-all ${modelConfig.framing === f ? 'bg-white text-black border-white shadow-xl' : 'bg-zinc-950/40 text-zinc-500 border-white/5'}`}>
                      {FRAMING_ICONS[f]}
                      <span className="text-[9px] font-black uppercase">{f === 'Close-up' ? '特写' : f === 'Bust Shot' ? '胸像' : f === 'Upper Body' ? '上半身' : '全身'}</span>
                    </button>
                  ))}
                </div>
                <Selector label="导出比例" options={Object.keys(RATIO_MAP)} current={modelConfig.aspectRatio} onChange={(v: any) => setModelConfig(p => ({...p, aspectRatio: v}))} labelMap={RATIO_MAP} />
              </div>
           </div>

           <Button onClick={() => checkKeyAndRun(async () => generateEyewearImage(imageBase64, imageSize, modelConfig), "商业摄影")} className="w-full h-20 rounded-[2rem] bg-white text-black font-black shadow-2xl" isLoading={isGenerating}>开启商业摄影渲染</Button>
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
                          <Button variant="secondary" onClick={() => setIsCameraOpen(true)} className="rounded-2xl h-16"><IconCamera /> <span className="ml-3">开启专业相机</span></Button>
                          <Button onClick={() => fileInputRef.current?.click()} className="rounded-2xl h-16"><IconUpload /> <span className="ml-3">上传产品底图</span></Button>
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
                      {!isGenerating && (
                        <button onClick={() => { setPreviewUrl(null); setImageBase64(''); setGeneratedImage(null); setMode(AppMode.DASHBOARD); }} className="absolute top-8 right-8 w-12 h-12 rounded-full bg-black/50 backdrop-blur border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="xl:col-span-5">
                {mode === AppMode.DASHBOARD && (
                  <div className="space-y-10 animate-fade-in">
                    <h2 className="text-4xl lg:text-5xl font-black italic font-serif text-white">选择创作流</h2>
                    <div className="grid gap-5">
                       <FeatureCard title="模特试戴" description="行业级人像渲染，深度定制产品定位、服装搭配与姿态" icon={<IconModel />} onClick={() => setMode(imageBase64 ? AppMode.MODEL_CONFIG : AppMode.DASHBOARD)} />
                       <FeatureCard title="海报工坊" description="物理级材质渲染，生成品牌视觉大片" icon={<IconPoster />} onClick={() => setMode(imageBase64 ? AppMode.POSTER_GENERATION : AppMode.DASHBOARD)} />
                    </div>
                  </div>
                )}
                {mode === AppMode.MODEL_CONFIG && imageBase64 && renderModelConfig()}
                {mode === AppMode.POSTER_GENERATION && imageBase64 && (
                   <div className="space-y-10 animate-fade-in pb-32">
                     <button onClick={() => setMode(AppMode.DASHBOARD)} className="text-[10px] text-zinc-600 uppercase tracking-widest hover:text-white">← 返回</button>
                     <h2 className="text-4xl lg:text-5xl font-black italic font-serif text-white">海报工坊</h2>
                     <div className="space-y-8">
                       <div className="bg-zinc-900/20 p-8 rounded-[2rem] border border-white/5 space-y-4">
                         <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">品牌标题</label>
                         <input type="text" value={posterConfig.title} onChange={(e) => setPosterConfig({...posterConfig, title: e.target.value})} className="w-full bg-zinc-950 border border-white/5 rounded-2xl px-6 py-5 text-white font-serif italic text-2xl focus:border-white/20 outline-none" />
                       </div>
                       <Button onClick={() => checkKeyAndRun(async () => generatePosterImage(imageBase64, posterConfig, imageSize, modelConfig.aspectRatio), "商业海报")} className="w-full h-20 rounded-[2rem] bg-white text-black font-black shadow-2xl" isLoading={isGenerating}>导出海报资产</Button>
                     </div>
                   </div>
                )}
                {mode === AppMode.RESULT && generatedImage && (
                  <div className="space-y-10 animate-fade-in">
                    <h2 className="text-4xl font-serif italic text-white">资产已就绪</h2>
                    <div className="space-y-4">
                      <Button onClick={() => { const link = document.createElement('a'); link.href = generatedImage!; link.download = `eyewear-${Date.now()}.png`; link.click(); }} className="w-full h-20 rounded-[2rem]">保存 8K 高清原图</Button>
                      <Button variant="outline" onClick={() => setMode(AppMode.DASHBOARD)} className="w-full h-20 rounded-[2rem]">开启新创作</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {isCameraOpen && (
        <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center">
           <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
           <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-10">
              <button onClick={() => setFacingMode(f => f === 'user' ? 'environment' : 'user')} className="w-16 h-16 rounded-full ios-glass text-white flex items-center justify-center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 10c0-4.418-3.582-8-8-8s-8 3.582-8 8 3.582 8 8 8c2.187 0 4.168-.881 5.606-2.304l1.894 1.894V10h-7.59l1.894 1.894C12.373 13.313 10.312 14 8 14c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6h2z"/></svg></button>
              <button onClick={capturePhoto} className="w-24 h-24 rounded-full bg-white border-[6px] border-white/20 active:scale-90 shadow-2xl" />
              <button onClick={stopCamera} className="w-16 h-16 rounded-full ios-glass text-red-500 flex items-center justify-center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
           </div>
           <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
      {error && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 ios-glass px-10 py-6 rounded-full text-red-400 text-xs font-black z-[500]">{error}</div>}
    </div>
  );

  async function checkKeyAndRun(action: () => Promise<string>, type: string) {
    setIsGenerating(true); setError(null);
    try {
      await ensureApiKey();
      const url = await action();
      setGeneratedImage(url);
      setMode(AppMode.RESULT);
      setHistory(prev => [{ id: Math.random().toString(36).substr(2, 4).toUpperCase(), url, type, timestamp: Date.now() }, ...prev]);
    } catch (err: any) {
      setError("渲染引擎繁忙，请稍后重试");
    } finally { setIsGenerating(false); }
  }
};

const NavItem = ({ active, onClick, icon, label }: any) => (
  <div onClick={onClick} className={`flex items-center gap-5 px-6 py-5 rounded-2xl cursor-pointer transition-all ${active ? 'bg-white text-black font-bold' : 'text-zinc-600 hover:text-white'}`}>
    {icon} <span className="text-[10px] tracking-[0.2em] uppercase font-black">{label}</span>
  </div>
);

const SelectorGroup = ({ title, icon, color, children }: any) => (
  <div className="space-y-10 p-6 lg:p-8 bg-zinc-900/10 rounded-[2.5rem] border border-white/[0.03]">
    <div className="flex items-center gap-4">
      <div className={`p-2.5 rounded-xl ${color} bg-opacity-10 border border-current/10`}>{icon}</div>
      <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">{title}</h3>
    </div>
    <div className="space-y-12">{children}</div>
  </div>
);

const Selector = ({ label, options, current, onChange, labelMap }: any) => (
  <div className="flex flex-col gap-5">
    <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">{label}</label>
    <div className="flex flex-wrap gap-2.5">
      {options.map((opt: string) => (
        <button key={opt} onClick={() => onChange(opt)} className={`px-5 py-4 rounded-2xl text-[10px] font-black border transition-all ${current === opt ? 'bg-white text-black border-white' : 'bg-zinc-950/40 text-zinc-500 border-white/5 hover:border-white/20'}`}>
          {labelMap ? (labelMap[opt] || opt) : opt}
        </button>
      ))}
    </div>
  </div>
);

export default App;
