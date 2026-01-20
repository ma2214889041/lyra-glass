# Lyra Glass - AI 眼镜产品摄影平台

<div align="center">

**利用 AI 技术为眼镜产品生成专业级模特试戴照片**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)

[功能特性](#功能特性) • [技术栈](#技术栈) • [快速开始](#快速开始) • [项目结构](#项目结构) • [API 文档](#api-文档)

</div>

---

## 📖 项目简介

Lyra Glass 是一个专为眼镜行业打造的 AI 产品摄影解决方案。通过 Google Gemini AI 技术，用户只需上传眼镜产品图，即可自动生成多种场景、多种模特类型的专业试戴照片，大幅降低摄影成本。

### 核心优势

- 🎨 **模板广场**：预设多种专业摄影风格模板
- 🤖 **AI 优化**：管理员可使用 AI 智能优化提示词
- ⚡ **异步处理**：后台任务队列，无需等待，支持离线生成
- 👥 **批量生成**：一键生成多个模特组合
- 📊 **自定义配置**：精细调整模特特征、场景参数
- 🔐 **用户系统**：支持普通用户和管理员角色

---

## ✨ 功能特性

### 用户功能

#### 1. 创作工坊
- 上传眼镜产品图
- 自定义模特参数：
  - 民族（东亚、东南亚、南亚、欧裔、非裔、拉丁裔、中东裔）
  - 年龄（青少年、青年、中年、老年）
  - 性别（男性、女性、中性）
  - 表情（自然、微笑等）
  - 服装风格、姿势等扩展参数
- 选择图片质量（1K/2K/4K）和尺寸比例

#### 2. 模板广场
- 浏览管理员发布的预设模板
- 按标签筛选（如：商务、休闲、户外）
- 查看模板详情并编辑提示词
- 一键应用模板生成图片

#### 3. 批量生成
- 勾选多个模特组合
- 一次性生成所有变体
- 后台异步处理

#### 4. 作品集
- 查看所有历史生成记录
- 提示词历史管理
- 收藏喜欢的模板
- 反馈系统（点赞/点踩）

### 管理员功能

#### 1. 模板管理
- 创建/编辑/删除模板
- 上传示例图片
- 编写或使用 AI 优化提示词
- 为模板添加多个标签

#### 2. AI 提示词优化
- 一键调用 Gemini 2.0 Flash 优化提示词
- 自动生成男性/女性两个版本
- 遵循眼镜产品摄影最佳实践

#### 3. 标签管理
- 创建/编辑/删除标签
- 管理标签颜色

### 异步任务队列

#### 核心特性
- ✅ **后台处理**：提交任务后立即返回，无需等待
- ✅ **实时状态**：前端每5秒自动轮询任务状态
- ✅ **可视化队列**：右下角浮窗显示所有活动任务
- ✅ **并发控制**：同时处理最多2个任务
- ✅ **自动恢复**：卡住的任务自动重置

#### 工作流程
```
用户提交任务 → 写入数据库 → 后台处理器轮询 
→ 调用 Gemini API → 保存结果 → 前端自动刷新
```

---

## 🛠 技术栈

### 前端
- **框架**：React 18 + TypeScript
- **路由**：React Router v6
- **样式**：Tailwind CSS
- **构建工具**：Vite

### 后端
- **运行时**：Node.js + Express
- **数据库**：SQLite (better-sqlite3)
- **AI 模型**：Google Gemini (imagen-3.0-generate-001)
- **认证**：JWT

### 核心库
- `@google/generative-ai` - Gemini AI SDK
- `bcryptjs` - 密码加密
- `jsonwebtoken` - JWT 认证
- `multer` - 文件上传
- `cors` - 跨域支持

---

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm 或 yarn

### 安装步骤

1. **克隆仓库**
```bash
git clone <repository-url>
cd lyra-glass
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**

创建 `server/.env` 文件：
```env
# Gemini API 密钥（必需）
GEMINI_API_KEY=your_gemini_api_key_here

# 管理员账户（可选，默认 admin/admin123）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# JWT 密钥（可选，默认自动生成）
JWT_SECRET=your_jwt_secret_here

# 服务器端口（可选，默认 3001）
PORT=3001
```

4. **启动开发服务器**
```bash
npm run dev:all
```

前端将在 `http://localhost:5173` 启动  
后端将在 `http://localhost:3001` 启动

### 生产环境部署

```bash
# 构建前端
npm run build

# 启动后端
npm run server
```

---

## 📁 项目结构

```
lyra-glass/
├── src/                    # 前端源码
│   ├── App.tsx            # 主应用组件
│   ├── types.ts           # TypeScript 类型定义
│   ├── components/        # React 组件
│   └── services/          # API 服务层
│       └── api.ts         # 后端 API 调用封装
├── server/                # 后端源码
│   ├── index.js           # Express 服务器入口
│   ├── db.js              # 数据库操作
│   ├── gemini.js          # Gemini AI 集成
│   ├── taskProcessor.js   # 异步任务处理器
│   └── .env               # 环境变量（需自行创建）
├── public/                # 静态资源
├── package.json
└── README.md
```

---

## 🔌 API 文档

### 认证相关

| 端点 | 方法 | 说明 | 需要认证 |
|------|------|------|----------|
| `/api/auth/login` | POST | 用户登录 | ❌ |
| `/api/auth/register` | POST | 用户注册 | ❌ |
| `/api/auth/verify` | GET | 验证 Token | ✅ |
| `/api/auth/change-password` | POST | 修改密码 | ✅ |

### 模板管理

| 端点 | 方法 | 说明 | 需要认证 |
|------|------|------|----------|
| `/api/templates` | GET | 获取模板列表 | ❌ |
| `/api/templates` | POST | 创建模板 | ✅ (Admin) |
| `/api/templates/:id` | PUT | 更新模板 | ✅ (Admin) |
| `/api/templates/:id` | DELETE | 删除模板 | ✅ (Admin) |

### 生成相关

| 端点 | 方法 | 说明 | 需要认证 |
|------|------|------|----------|
| `/api/tasks/generate` | POST | 提交单个生成任务 | ✅ |
| `/api/tasks/batch` | POST | 提交批量生成任务 | ✅ |
| `/api/tasks` | GET | 获取用户任务列表 | ✅ |
| `/api/tasks/:taskId` | GET | 查询任务状态 | ✅ |
| `/api/tasks/queue/stats` | GET | 获取队列统计 | ✅ |

### 其他

| 端点 | 方法 | 说明 | 需要认证 |
|------|------|------|----------|
| `/api/tags` | GET/POST/PUT/DELETE | 标签管理 | ✅ (Admin) |
| `/api/user/favorites` | GET/POST/DELETE | 收藏管理 | ✅ |
| `/api/user/history` | GET | 生成历史 | ✅ |
| `/api/user/prompt-history` | GET | 提示词历史 | ✅ |
| `/api/feedback` | POST | 提交反馈 | ✅ |

---

## 🗄️ 数据库设计

### 核心表

- **users** - 用户账户信息
- **templates** - 模板数据（图片、提示词、标签）
- **tags** - 标签系统
- **generated_images** - 生成记录
- **tasks** - 异步任务队列
- **favorites** - 用户收藏
- **prompt_history** - 提示词历史
- **feedback** - 用户反馈

---

## 🎯 使用指南

### 普通用户

1. **注册/登录**：创建账户或使用已有账户登录
2. **上传眼镜图**：在"创作工坊"上传产品图
3. **选择生成方式**：
   - **方式一**：自定义配置参数
   - **方式二**：选择模板广场的预设模板
   - **方式三**：批量生成多个变体
4. **提交任务**：点击生成按钮
5. **查看状态**：右下角浮窗显示任务进度
6. **获取结果**：任务完成后自动出现在"作品集"

### 管理员

1. **登录管理后台**：使用管理员账户登录
2. **创建模板**：
   - 上传示例图片
   - 输入提示词（或使用 AI 优化）
   - 添加标签
   - 发布到模板广场
3. **管理标签**：创建/编辑分类标签

---

## 🔐 安全说明

- 密码使用 bcrypt 加密存储
- JWT Token 用于身份验证
- 管理员端点需要管理员权限
- 敏感信息（如 API 密钥）存储在 `.env` 文件中
- **重要**：`.env` 文件已加入 `.gitignore`，请勿上传到公开仓库

---

## 📝 待办事项

- [ ] 添加 WebSocket 实现任务实时推送
- [ ] 任务完成浏览器通知
- [ ] 支持任务取消
- [ ] 图片压缩和 CDN 集成
- [ ] 多语言支持
- [ ] 移动端响应式优化

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

---

## 🙏 致谢

- [Google Gemini AI](https://ai.google.dev/) - 强大的 AI 图像生成能力
- [React](https://reactjs.org/) - 优秀的前端框架
- [Tailwind CSS](https://tailwindcss.com/) - 现代化的 CSS 框架

---

<div align="center">

**由 ❤️ 驱动，为眼镜行业赋能**

</div>
