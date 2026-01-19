
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  AppMode, NavTab, ImageSize, AspectRatio, PosterConfig, 
  GeneratedImage, ModelConfig, EyewearType,
  EthnicityType, LightingType, FramingType, CommercialStyle, ModelVibe,
  CameraType, LensType, SkinTexture, MoodType, StylePreset, TemplateItem
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

const DEFAULT_CONFIG: ModelConfig = {
  eyewearType: 'Auto-detect',
  visualPurpose: 'Brand Campaign',
  modelVibe: 'Calm & Intellectual',
  ethnicity: 'East Asian',
  gender: 'Female',
  age: 'Adult',
  scene: "Minimalist concrete studio, high-end photography.",
  framing: 'Close-up',
  camera: 'Hasselblad H6D',
  lens: '85mm f/1.4',
  skinTexture: 'Natural Commercial',
  lighting: 'Softbox Diffused',
  mood: 'Natural Soft',
  aspectRatio: '3:4'
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [activeTab, setActiveTab] = useState<NavTab>(NavTab.CREATE);
  const [configDepth, setConfigDepth] = useState<'basic' | 'master'>('basic');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  
  // 模板系统数据
  const [templates, setTemplates] = useState<TemplateItem[]>(() => {
    const saved = localStorage.getItem('lyra_templates');
    return saved ? JSON.parse(saved) : [];
  });

  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_CONFIG);

  // 管理员状态
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [newTemplateImage, setNewTemplateImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('lyra_templates', JSON.stringify(templates));
  }, [templates]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setPreviewUrl(URL.createObjectURL(file));
      setImageBase64(await convertBlobToBase64(file));
      setGeneratedImage(null);
      setMode(AppMode.DASHBOARD);
    }
  };

  const handleApplyTemplate = (template: TemplateItem) => {
    setModelConfig(template.config);
    if (!imageBase64) {
      setActiveTab(NavTab.CREATE);
      setError("请先上传您的眼镜图片");
    } else {
      setMode(AppMode.MODEL_CONFIG);
      setActiveTab(NavTab.CREATE);
    }
  };

  const handleAdminAddTemplate = async () => {
    if (!newTemplateImage) return;
    const newTpl: TemplateItem = {
      id: Date.now().toString(),
      imageUrl: newTemplateImage,
      name: "新上传模板",
      description: "由管理员配置",
      config: { ...modelConfig }
    };
    setTemplates([newTpl, ...templates]);
    setNewTemplateImage(null);
    alert("模板已添加至广场");
  };

  const handleRun = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await ensureApiKey();
      const url = await generateEyewearImage(imageBase64, '1K', modelConfig);
      setGeneratedImage(url);
      setMode(AppMode.RESULT);
    } catch (err: any) {
      setError("渲染失败，请检查配置。");
    } finally {
      setIsGenerating(false);
    }
  };

  // 渲染模板广场
  const renderTemplateGallery = () => (
    <div className="space-y-12 animate-fade-in pb-20">
      <div className="space-y-4 text-center max-w-xl mx-auto">
        <h2 className="text-5xl font-serif italic text-white">模板广场</h2>
        <p className="text-zinc-500 text-xs uppercase tracking-[0.3em] font-black">Curated Masterpiece Library</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {templates.length === 0 && (
          <div className="col-span-full py-32 text-center ios-card">
            <p className="text-zinc-600 font-black uppercase tracking-widest text-[10px]">暂无公开模板，请前往管理后台上传</p>
          </div>
        )}
        {templates.map(tpl => (
          <div 
            key={tpl.id}
            onClick={() => handleApplyTemplate(tpl)}
            className="group relative aspect-[3/4] rounded-[3rem] overflow-hidden cursor-pointer border border-white/5 hover:border-white/20 transition-all duration-700 hover:scale-[1.02] shadow-2xl"
          >
            <img src={tpl.imageUrl} className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all duration-700" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute bottom-10 left-10 right-10 space-y-3 translate-y-4 group-hover:translate-y-0 transition-all duration-700">
              <h3 className="text-2xl font-serif italic text-white">{tpl.name}</h3>
              <p className="text-zinc-400 text-[10px] uppercase tracking-widest font-bold line-clamp-1">{tpl.description}</p>
              <div className="pt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="px-5 py-2 rounded-full bg-white text-black text-[9px] font-black uppercase tracking-widest">立即套用</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // 渲染配置页面
  const renderConfig = () => {
    const ethnicityMap = { 'East Asian': '东亚', 'Caucasian': '欧裔', 'African': '非裔', 'Hispanic/Latino': '拉丁裔' };
    const purposeMap = { 'Brand Campaign': '品牌大片', 'E-commerce Main': '电商主图', 'Social Media': '社媒推广' };
    const framingMap = { 'Close-up': '特写', 'Bust Shot': '胸像', 'Upper Body': '腰部半身', 'Full Body': '全身' };

    return (
      <div className="space-y-12 animate-fade-in pb-32 max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-4xl font-serif italic text-white">视觉配置</h2>
          <div className="flex bg-zinc-900 p-1 rounded-2xl border border-white/5">
            <button onClick={() => setConfigDepth('basic')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${configDepth === 'basic' ? 'bg-white text-black' : 'text-zinc-500'}`}>基础</button>
            <button onClick={() => setConfigDepth('master')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${configDepth === 'master' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-zinc-500'}`}>大师</button>
          </div>
        </div>

        <div className="space-y-10">
          <SelectorGroup title="角色模型" icon={<IconModel />} color="text-white">
            <Selector label="族裔" options={Object.keys(ethnicityMap)} current={modelConfig.ethnicity} onChange={(v: any) => setModelConfig(p => ({...p, ethnicity: v}))} labelMap={ethnicityMap} />
            <div className="grid grid-cols-2 gap-8">
              <Selector label="年龄段" options={['Youth', 'Adult', 'Mature']} current={modelConfig.age} onChange={(v: any) => setModelConfig(p => ({...p, age: v}))} labelMap={{'Youth':'青年','Adult':'成熟','Mature':'资深'}} />
              <Selector label="性别" options={['Female', 'Male']} current={modelConfig.gender} onChange={(v: any) => setModelConfig(p => ({...p, gender: v}))} labelMap={{'Female':'女性','Male':'男性'}} />
            </div>
          </SelectorGroup>

          <SelectorGroup title="摄影规格" icon={<IconCamera />} color="text-blue-400">
            <Selector label="景别选择" options={Object.keys(framingMap)} current={modelConfig.framing} onChange={(v: any) => setModelConfig(p => ({...p, framing: v}))} labelMap={framingMap} />
            <Selector label="商业用途" options={Object.keys(purposeMap)} current={modelConfig.visualPurpose} onChange={(v: any) => setModelConfig(p => ({...p, visualPurpose: v}))} labelMap={purposeMap} />
          </SelectorGroup>

          {configDepth === 'master' && (
            <SelectorGroup title="光学渲染 (Master Only)" icon={<IconCreative />} color="text-yellow-400">
               <Selector label="摄影机" options={['Hasselblad H6D', 'Sony A7R V', 'Leica M11']} current={modelConfig.camera} onChange={(v: any) => setModelConfig(p => ({...p, camera: v}))} />
               <Selector label="灯光策略" options={['Softbox Diffused', 'Butterfly (Paramount)', 'Rembrandt', 'Neon Noir']} current={modelConfig.lighting} onChange={(v: any) => setModelConfig(p => ({...p, lighting: v}))} />
               <Selector label="胶片色调" options={['Natural Soft', 'Vintage Film', 'Cinematic Teal & Orange']} current={modelConfig.mood} onChange={(v: any) => setModelConfig(p => ({...p, mood: v}))} />
            </SelectorGroup>
          )}

          <Button onClick={handleRun} className={`w-full h-24 rounded-[2.5rem] font-black text-[12px] shadow-2xl transition-all duration-500 ${configDepth === 'master' ? 'bg-blue-600 text-white' : 'bg-white text-black'}`} isLoading={isGenerating}>
            {configDepth === 'master' ? '执行大师级渲染' : '即刻生成大片'}
          </Button>
        </div>
      </div>
    );
  };

  // 渲染管理员页面
  const renderAdmin = () => (
    <div className="max-w-4xl mx-auto space-y-12 animate-fade-in">
      <div className="space-y-4">
        <h2 className="text-5xl font-serif italic text-white">管理员后台</h2>
        <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-black">Template & Logic Management</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-8">
           <div 
             onClick={() => adminFileInputRef.current?.click()}
             className="aspect-[3/4] rounded-[2.5rem] bg-zinc-900 border border-dashed border-white/10 flex items-center justify-center cursor-pointer overflow-hidden"
           >
             {newTemplateImage ? (
               <img src={newTemplateImage} className="w-full h-full object-cover" />
             ) : (
               <span className="text-zinc-500 font-bold uppercase tracking-widest text-[9px]">点击上传模板底图</span>
             )}
             <input type="file" ref={adminFileInputRef} className="hidden" onChange={async (e) => {
               if (e.target.files?.[0]) setNewTemplateImage(`data:image/jpeg;base64,${await convertBlobToBase64(e.target.files[0])}`);
             }} />
           </div>
           <Button onClick={handleAdminAddTemplate} className="w-full h-16 rounded-2xl">发布至模板广场</Button>
        </div>

        <div className="space-y-8">
           <div className="p-8 ios-card space-y-6">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">当前模板 Prompt 参数映射</h4>
              {renderConfig()}
           </div>
           <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">已上传列表</h4>
              <div className="space-y-3">
                {templates.map(t => (
                  <div key={t.id} className="p-4 bg-zinc-900/50 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <img src={t.imageUrl} className="w-10 h-10 rounded-lg object-cover" />
                      <span className="text-xs font-bold text-zinc-300">{t.name}</span>
                    </div>
                    <button onClick={() => setTemplates(templates.filter(x => x.id !== t.id))} className="text-red-900 text-[10px] font-black uppercase hover:text-red-500 transition-colors">删除</button>
                  </div>
                ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col lg:flex-row font-sans overflow-x-hidden">
      {/* 侧边导航 */}
      <aside className="hidden lg:flex flex-col w-72 bg-zinc-950 border-r border-white/5 h-screen sticky top-0 z-50">
        <div className="p-12 flex items-center gap-3">
          <div className="w-9 h-9 bg-white text-black rounded-xl font-serif font-black flex items-center justify-center text-2xl">L</div>
          <span className="font-black text-2xl font-serif italic text-white">Lyra</span>
        </div>
        <nav className="flex-1 px-8 py-4 space-y-2">
          <NavItem active={activeTab === NavTab.CREATE} onClick={() => { setActiveTab(NavTab.CREATE); setMode(AppMode.DASHBOARD); }} icon={<IconCreative />} label="创作工坊" />
          <NavItem active={activeTab === NavTab.TEMPLATES} onClick={() => { setActiveTab(NavTab.TEMPLATES); setMode(AppMode.MODEL_SHOT); }} icon={<IconPoster />} label="模板广场" />
          <NavItem active={activeTab === NavTab.GALLERY} onClick={() => setActiveTab(NavTab.GALLERY)} icon={<IconGallery />} label="作品集" />
          <div className="pt-20">
             <NavItem active={activeTab === NavTab.ADMIN} onClick={() => { setActiveTab(NavTab.ADMIN); setMode(AppMode.ADMIN); }} icon={<IconSettings />} label="后台管理" />
          </div>
        </nav>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 flex flex-col min-h-screen">
        <div className="container mx-auto px-6 py-12 lg:px-20 lg:py-20">
          
          {activeTab === NavTab.TEMPLATES && renderTemplateGallery()}
          {activeTab === NavTab.ADMIN && renderAdmin()}

          {activeTab === NavTab.CREATE && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-16">
              <div className="xl:col-span-7">
                <div className="aspect-[3/4] rounded-[3.5rem] overflow-hidden border border-white/5 bg-[#080808] flex items-center justify-center relative shadow-2xl">
                  {!imageBase64 ? (
                    <div className="p-12 text-center space-y-12 animate-fade-in">
                       <h1 className="text-7xl font-black font-serif italic text-white leading-tight tracking-tight">上传您的资产</h1>
                       <div className="flex flex-col gap-4 max-w-xs mx-auto">
                          <Button onClick={() => fileInputRef.current?.click()} className="rounded-3xl h-20 text-sm"><IconUpload /> <span className="ml-3">上传眼镜 PNG/JPG</span></Button>
                          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                          <p className="text-zinc-600 text-[9px] uppercase tracking-widest">请确保眼镜主体清晰，背景尽可能纯净</p>
                       </div>
                    </div>
                  ) : (
                    <>
                      <img src={generatedImage || previewUrl!} className={`max-w-full max-h-full object-contain ${isGenerating ? 'opacity-30 blur-3xl grayscale transition-all duration-1000' : 'transition-all duration-700'}`} />
                      {isGenerating && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 bg-black/40 backdrop-blur-3xl px-12 text-center">
                           <div className="relative">
                              <div className="w-24 h-24 border-2 border-white/10 rounded-full"></div>
                              <div className="absolute inset-0 w-24 h-24 border-t-2 border-white rounded-full animate-spin"></div>
                           </div>
                           <p className="text-[12px] text-white uppercase tracking-[0.4em] font-black animate-pulse">正在执行物理锁定渲染...</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="xl:col-span-5">
                {mode === AppMode.DASHBOARD && (
                  <div className="space-y-10">
                    <h2 className="text-6xl font-black italic font-serif text-white">开始创作</h2>
                    <div className="grid gap-6">
                       <FeatureCard title="商业模特试戴" description="一键配置模特属性，支持物理光影锁定与折射追踪。" icon={<IconModel />} onClick={() => setMode(AppMode.MODEL_CONFIG)} />
                       <FeatureCard title="从模板生成" description="套用高质量大师模板，一键获得品牌级视觉效果。" icon={<IconPoster />} onClick={() => setActiveTab(NavTab.TEMPLATES)} />
                    </div>
                  </div>
                )}
                {mode === AppMode.MODEL_CONFIG && renderConfig()}
                {mode === AppMode.RESULT && generatedImage && (
                  <div className="space-y-10 animate-fade-in">
                    <h2 className="text-6xl font-serif italic text-white">渲染完成</h2>
                    <div className="space-y-4">
                      <Button onClick={() => {
                        const link = document.createElement('a');
                        link.href = generatedImage!;
                        link.download = `lyra-shoot.png`;
                        link.click();
                      }} className="w-full h-24 rounded-[2.5rem] bg-white text-black font-black text-sm">导出商业级原图</Button>
                      <Button variant="outline" onClick={() => setMode(AppMode.DASHBOARD)} className="w-full h-24 rounded-[2.5rem] text-sm">重新配置</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {error && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 ios-glass px-10 py-6 rounded-3xl text-red-400 text-[10px] font-black z-[500] uppercase tracking-widest border-red-900/20">{error}</div>}
    </div>
  );
};

// 辅助图标
const IconSettings = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
);

const NavItem = ({ active, onClick, icon, label }: any) => (
  <div onClick={onClick} className={`flex items-center gap-5 px-6 py-5 rounded-2xl cursor-pointer transition-all duration-300 ${active ? 'bg-white text-black font-bold scale-[1.02] shadow-xl' : 'text-zinc-600 hover:text-white hover:bg-white/5'}`}>
    {icon} <span className="text-[10px] tracking-[0.2em] uppercase font-black">{label}</span>
  </div>
);

const SelectorGroup = ({ title, icon, color, children }: any) => (
  <div className="space-y-10 p-10 bg-zinc-900/10 rounded-[3rem] border border-white/[0.03] shadow-inner">
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-2xl ${color} bg-opacity-10 flex items-center justify-center border border-current/10`}>{icon}</div>
      <h3 className="text-[13px] font-black uppercase tracking-[0.2em] text-white/90">{title}</h3>
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
          className={`px-5 py-4 rounded-2xl text-[10px] font-bold border transition-all duration-500 ${current === opt ? 'bg-white text-black border-white shadow-xl scale-105' : 'bg-zinc-950/40 text-zinc-500 border-white/5 hover:border-white/20'}`}
        >
          {labelMap ? (labelMap[opt] || opt) : opt}
        </button>
      ))}
    </div>
  </div>
);

export default App;
