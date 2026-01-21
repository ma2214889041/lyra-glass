import 'dotenv/config';
import { uploadImageToR2 } from './storage.js';
import fs from 'fs';

// 测试 R2 上传功能
async function testR2Upload() {
    console.log('🧪 开始测试 R2 上传...\n');

    // 创建一个简单的测试图片（1x1 像素的 PNG）
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const testImageData = `data:image/png;base64,${testImageBase64}`;

    try {
        console.log('📤 正在上传测试图片到 R2...');
        const imageUrl = await uploadImageToR2(testImageData, 1, 'test_' + Date.now());

        console.log('\n✅ R2 上传成功！');
        console.log('📍 图片 URL:', imageUrl);
        console.log('\n🌐 请在浏览器中打开以下 URL 验证：');
        console.log(imageUrl);
        console.log('\n✨ R2 配置正常工作！');

        return true;
    } catch (error) {
        console.error('\n❌ R2 上传失败:', error.message);
        console.error('\n请检查：');
        console.error('1. .env 文件中的 R2 配置是否正确');
        console.error('2. Access Key 和 Secret Key 是否有效');
        console.error('3. 存储桶名称是否正确');
        console.error('4. 网络连接是否正常');

        return false;
    }
}

// 运行测试
testR2Upload()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
