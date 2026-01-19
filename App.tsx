
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  AppMode, NavTab, ImageSize, AspectRatio, PosterConfig, 
  GeneratedImage, ModelConfig, EyewearType,
  EthnicityType, LightingType, FramingType, CommercialStyle, ModelVibe
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
      const result = (reader.result as string).split(',')[1];
      resolve(result);
    };
    reader.readAsDataURL(blob);
  });
};

const LOADING_MESSAGES = [
  "正在初始化 [CORE DIRECTIVE] 物理锁定引擎...",
  "分析眼镜 PBR 材质与镜片折射属性...",
  "配置 85mm 商业人像摄影镜头逻辑...",
  "执行分层权重渲染 (Primary: Eyewear)...",
  "同步 8K 高保真肤质修饰方案..."
];

const EYEWEAR_SCENES = [
  { name: "侘寂风水泥背景", prompt: "Minimalist concrete studio, wabi-sabi textures, limestone gray, micro-cement floor." },
  { name: "极简无缝墙", prompt: "Pure off-white infinity cove studio, clinical commercial lighting." },
  { name: "现代办公视窗", prompt: "Contemporary executive office, high-rise urban skyline view, natural sunlight." },
  { name: "私人图书室", prompt: "Walnut bookshelves, leather-bound books, low-key scholarly atmosphere." },
  { name: "阳光露台", prompt: "Stucco wall terrace, golden hour sunset, cinematic long shadows." },
  { name: "工业风天台", prompt: "Urban rooftop, brutalist architecture, high-contrast sky." }
];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [activeTab, setActiveTab] = useState<NavTab>(NavTab.CREATE);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    eyewearType: 'Auto-detect',
    visualPurpose: 'Brand Campaign',
    modelVibe: 'Calm & Intellectual',
    ethnicity: 'East Asian',
    gender: 'Female',
    age: 'Adult',
    scene: EYEWEAR_SCENES[0].prompt,
    framing: 'Close-up',
    camera: 'Hasselblad H6D',
    lens: '85mm f/1.4',
    skinTexture: 'Natural Commercial',
    lighting: 'Softbox Diffused',
    mood: 'Natural Soft',
    aspectRatio: '3:4'
  });

  const [posterConfig, setPosterConfig] = useState<PosterConfig>({
    title: 'THE VISIONARY',
    subtitle: 'Crafted Excellence',
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

  useEffect(() => {
    let interval: any;
    if (isGenerating) {
      interval = setInterval(() => setLoadingStep(prev => (prev + 1) % LOADING_MESSAGES.length), 3000);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setPreviewUrl(URL.createObjectURL(file));
      setImageBase64(await convertBlobToBase64(file));
      setGeneratedImage(null);
      setMode(AppMode.DASHBOARD);
    }
  };

  const handleRun = async (type: string) => {
    setIsGenerating(true);
    setError(null);
    try {
      await ensureApiKey();
      let url = '';
      if (type === 'model') url = await generateEyewearImage(imageBase64, '1K', modelConfig);
      else url = await generatePosterImage(imageBase64, posterConfig, '1K', modelConfig.aspectRatio);
      
      setGeneratedImage(url);
      setMode(AppMode.RESULT);
      setHistory(prev => [{ id: Math.random().toString(36).substr(2, 4).toUpperCase(), url, type, timestamp: Date.now() }, ...prev]);
    } catch (err: any) {
      setError("RENDER_ERROR: 请确保上传的产品底图清晰可见。");
    } finally {
      setIsGenerating(false);
    }
  };

  const renderModelConfig = () => {
    const ethnicityMap: Record<EthnicityType, string> = { 
      'East Asian': '东亚', 'Southeast Asian': '东南亚', 'South Asian': '南亚', 
      'Caucasian': '欧裔', 'Mediterranean': '地中海', 'Scandinavian': '北欧', 
      'African': '非裔', 'Hispanic/Latino': '拉丁裔', 'Middle Eastern': '中东' 
    };
    const purposeMap: Record<CommercialStyle, string> = {
      'E-commerce Main': '电商主图', 'Brand Campaign': '品牌大片', 'Social Media': '社媒推广', 'Lookbook': '画册样片', 'Advertising Poster': '广告海报'
    };
    const vibeMap: Record<ModelVibe, string> = {
      'Calm & Intellectual': '理性知性', 'Natural & Friendly': '亲和自然', 'High-Fashion Edge': '高端冷峻', 'Athletic Energy': '动感活力', 'Professional Executive': '专业职场'
    };
    const framingMap: Record<FramingType, string> = {
      'Close-up': '面部特写 (Close-up)',     // 强调材质细节
      'Bust Shot': '胸像半身 (Bust Shot)',   // 标准肖像
      'Upper Body': '腰部半身 (Waist-up)',   // 展示服装搭配
      'Full Body': '全身氛围 (Full Body)'     // 强调场景和整体 Look
    };
    const ageMap = { 'Child': '儿童', 'Teenager': '青少年', 'Youth': '青年', 'Adult': '成熟', 'Mature': '资深' };

    return (
      <div className="space-y-12 animate-fade-in pb-32 max-w-2xl mx-auto">
        <div className="space-y-3">
          <button onClick={() => setMode(AppMode.DASHBOARD)} className="text-[10px] text-zinc-600 uppercase tracking-widest hover:text-white transition-colors">← 返回</button>
          <h2 className="text-4xl font-black italic font-serif text-white">商业视觉配置</h2>
          <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.2em]">Structural Intent Engineering</p>
        </div>

        <div className="space-y-14">
          <SelectorGroup title="视觉策略 (Visual Strategy)" icon={<IconCreative />} color="text-yellow-400">
             <Selector label="视觉用途" options={Object.keys(purposeMap)} current={modelConfig.visualPurpose} onChange={(v: any) => setModelConfig(p => ({...p, visualPurpose: v}))} labelMap={purposeMap} />
             <Selector label="模特状态" options={Object.keys(vibeMap)} current={modelConfig.modelVibe} onChange={(v: any) => setModelConfig(p => ({...p, modelVibe: v}))} labelMap={vibeMap} />
          </SelectorGroup>

          <SelectorGroup title="角色特征 (Model Profile)" icon={<IconModel />} color="text-white">
            <Selector label="族裔" options={Object.keys(ethnicityMap)} current={modelConfig.ethnicity} onChange={(v: any) => setModelConfig(p => ({...p, ethnicity: v}))} labelMap={ethnicityMap} />
            <div className="grid grid-cols-2 gap-8">
              <Selector label="年龄段" options={Object.keys(ageMap)} current={modelConfig.age} onChange={(v: any) => setModelConfig(p => ({...p, age: v}))} labelMap={ageMap} />
              <Selector label="模特性别" options={['Female', 'Male', 'Non-binary']} current={modelConfig.gender} onChange={(v: any) => setModelConfig(p => ({...p, gender: v}))} labelMap={{'Female':'女性','Male':'男性','Non-binary':'中性'}} />
            </div>
          </SelectorGroup>

          <SelectorGroup title="构图与视角 (Composition & Perspective)" icon={<IconCamera />} color="text-blue-400">
            <Selector 
              label="景别选择 (Framing)" 
              options={Object.keys(framingMap)} 
              current={modelConfig.framing} 
              onChange={(v: any) => setModelConfig(p => ({...p, framing: v}))} 
              labelMap={framingMap} 
            />
            { (modelConfig.framing === 'Full Body' || modelConfig.framing === 'Upper Body') && (
              <p className="text-[9px] text-zinc-500 uppercase tracking-[0.2em] font-black px-1 animate-pulse">
                注：全身模式下将自动匹配时尚穿搭以增强氛围感。
              </p>
            )}
          </SelectorGroup>

          <div className="p-10 bg-zinc-900/10 rounded-[3rem] border border-white/[0.03] space-y-8">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">拍摄环境 (Environment)</h3>
            <div className="flex flex-wrap gap-3">
              {EYEWEAR_SCENES.map(s => (
                <button 
                  key={s.name} 
                  onClick={() => setModelConfig(p => ({...p, scene: s.prompt}))}
                  className={`px-5 py-4 rounded-2xl text-[10px] font-bold border transition-all duration-300 ${modelConfig.scene === s.prompt ? 'bg-white text-black border-white shadow-[0_15px_30px_rgba(255,255,255,0.1)] scale-105' : 'bg-zinc-950/40 text-zinc-500 border-white/5 hover:border-white/20'}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={() => handleRun('model')} className="w-full h-20 rounded-3xl bg-white text-black font-black text-[12px] shadow-[0_30px_60px_rgba(255,255,255,0.1)] active:scale-95" isLoading={isGenerating}>
            生成高端模特大片
          </Button>
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
        <nav className="flex-1 px-8 py-4 space-y-2">
          <NavItem active={activeTab === NavTab.CREATE} onClick={() => { setActiveTab(NavTab.CREATE); setMode(AppMode.DASHBOARD); }} icon={<IconCreative />} label="创作中心" />
          <NavItem active={activeTab === NavTab.GALLERY} onClick={() => setActiveTab(NavTab.GALLERY)} icon={<IconGallery />} label="作品集" />
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-h-screen">
        <div className="container mx-auto px-6 py-12 lg:px-20 lg:py-20">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-16">
            <div className="xl:col-span-7">
              <div className="aspect-[3/4] rounded-[3.5rem] overflow-hidden border border-white/5 bg-[#080808] flex items-center justify-center relative shadow-2xl">
                {!imageBase64 ? (
                  <div className="p-12 text-center space-y-12 animate-fade-in">
                     <h1 className="text-6xl font-black font-serif italic text-white leading-tight">眼镜摄影工坊</h1>
                     <div className="flex flex-col gap-4 max-w-xs mx-auto">
                        <Button onClick={() => fileInputRef.current?.click()} className="rounded-3xl h-16"><IconUpload /> <span className="ml-3">上传眼镜资产</span></Button>
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                     </div>
                  </div>
                ) : (
                  <>
                    <img src={generatedImage || previewUrl!} className={`max-w-full max-h-full object-contain ${isGenerating ? 'opacity-30 blur-md grayscale transition-all duration-1000' : 'transition-all duration-700'}`} />
                    {isGenerating && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 bg-black/40 backdrop-blur-xl px-12 text-center">
                         <div className="relative">
                            <div className="w-20 h-20 border-2 border-white/10 rounded-full"></div>
                            <div className="absolute inset-0 w-20 h-20 border-t-2 border-white rounded-full animate-spin"></div>
                         </div>
                         <div className="space-y-4">
                            <p className="text-[11px] text-white uppercase tracking-[0.3em] font-black animate-pulse">{LOADING_MESSAGES[loadingStep]}</p>
                            <div className="w-48 h-[1px] bg-white/10 mx-auto overflow-hidden">
                               <div className="w-full h-full bg-white origin-left animate-[loadingBar_3s_infinite]"></div>
                            </div>
                         </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="xl:col-span-5">
              {mode === AppMode.DASHBOARD && (
                <div className="space-y-10">
                  <h2 className="text-5xl font-black italic font-serif text-white">模式决策</h2>
                  <div className="grid gap-6">
                     <FeatureCard title="商业模特试戴" description="系统自动识别镜片类型，支持从细节特写到全身 Lookbook 的全场景渲染。" icon={<IconModel />} onClick={() => setMode(AppMode.MODEL_CONFIG)} />
                     <FeatureCard title="品牌海报工坊" description="基于材质交互与空间构图，一键生成高净值海报。" icon={<IconPoster />} onClick={() => setMode(AppMode.POSTER_GENERATION)} />
                  </div>
                </div>
              )}
              {mode === AppMode.MODEL_CONFIG && imageBase64 && renderModelConfig()}
              {mode === AppMode.RESULT && generatedImage && (
                <div className="space-y-10 animate-fade-in">
                  <div className="space-y-2">
                    <h2 className="text-5xl font-serif italic text-white">渲染完成</h2>
                    <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-black">Success: Asset Ready for Commercial Use</p>
                  </div>
                  <div className="space-y-4">
                    <Button onClick={() => {
                      const link = document.createElement('a');
                      link.href = generatedImage!;
                      link.download = `eyewear-${Date.now()}.png`;
                      link.click();
                    }} className="w-full h-20 rounded-3xl bg-white text-black font-black">导出 8K 商业原图</Button>
                    <Button variant="outline" onClick={() => setMode(AppMode.DASHBOARD)} className="w-full h-20 rounded-3xl">重新配置</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      {error && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 ios-glass px-10 py-6 rounded-[2.5rem] text-red-400 text-[10px] font-black z-[500] uppercase tracking-widest border-red-900/20">{error}</div>}
      <style>{`
        @keyframes loadingBar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

const NavItem = ({ active, onClick, icon, label }: any) => (
  <div onClick={onClick} className={`flex items-center gap-5 px-6 py-5 rounded-2xl cursor-pointer transition-all ${active ? 'bg-white text-black font-bold scale-[1.02] shadow-xl' : 'text-zinc-600 hover:text-white hover:bg-white/5'}`}>
    {icon} <span className="text-[10px] tracking-[0.2em] uppercase font-black">{label}</span>
  </div>
);

const SelectorGroup = ({ title, icon, color, children }: any) => (
  <div className="space-y-10 p-10 bg-zinc-900/10 rounded-[3rem] border border-white/[0.03] shadow-inner">
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-2xl ${color} bg-opacity-10 flex items-center justify-center border border-current/10 shadow-lg`}>{icon}</div>
      <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-white/90">{title}</h3>
      <div className="flex-1 h-[1px] bg-gradient-to-r from-zinc-800 to-transparent"></div>
    </div>
    <div className="space-y-12">{children}</div>
  </div>
);

const Selector = ({ label, options, current, onChange, labelMap }: any) => (
  <div className="flex flex-col gap-5">
    <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-black">{label}</label>
    <div className="flex flex-wrap gap-3">
      {options.map((opt: string) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-5 py-4 rounded-2xl text-[10px] font-bold border transition-all duration-300 ${current === opt ? 'bg-white text-black border-white shadow-lg scale-105' : 'bg-zinc-950/40 text-zinc-500 border-white/5 hover:border-white/20 hover:text-zinc-200'}`}
        >
          {labelMap ? (labelMap[opt] || opt) : opt}
        </button>
      ))}
    </div>
  </div>
);

export default App;
