#!/bin/bash

echo "🚀 启动 AI 眼镜后端服务..."
echo ""

# 检查是否在正确的目录
if [ ! -f "server/index.js" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 检查 .env 文件
if [ ! -f "server/.env" ]; then
    echo "⚠️  未找到 .env 文件，正在创建..."
    cp server/.env.example server/.env
    echo "✅ 已创建 server/.env"
    echo "📝 请编辑 server/.env 文件，添加你的 GEMINI_API_KEY"
    exit 1
fi

# 检查 API Key
if ! grep -q "GEMINI_API_KEY=AIza" server/.env 2>/dev/null; then
    echo "⚠️  警告：GEMINI_API_KEY 可能未配置"
    echo "📝 请确保 server/.env 中包含有效的 Gemini API Key"
    echo ""
fi

# 检查 node_modules
if [ ! -d "server/node_modules" ]; then
    echo "📦 正在安装依赖..."
    cd server && npm install && cd ..
fi

# 启动服务器
echo "✅ 配置检查完成"
echo ""
echo "🌐 服务器将在以下地址启动："
echo "   http://localhost:3001"
echo ""
echo "📊 健康检查：http://localhost:3001/api/health"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd server && npm start
