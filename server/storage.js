import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 本地上传目录
const UPLOAD_DIR = path.join(__dirname, 'uploads', 'generated');
const ASSETS_DIR = path.join(__dirname, 'uploads', 'assets');

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log(`📁 创建上传目录: ${UPLOAD_DIR}`);
}
if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    console.log(`📁 创建资源目录: ${ASSETS_DIR}`);
}

/**
 * 保存图片到本地文件系统（原图 PNG + 缩略图 WebP）
 * @param {string} imageData - base64 图片数据或 data URL
 * @param {number} userId - 用户 ID
 * @param {string} imageId - 图片唯一 ID
 * @returns {Promise<{url: string, thumbnailUrl: string}>} 图片访问 URL
 */
export async function saveImageLocally(imageData, userId, imageId) {
    // 从 data URL 中提取 base64 数据
    let base64Data = imageData;
    if (imageData.startsWith('data:')) {
        base64Data = imageData.split(',')[1];
    }

    // 解码 base64 为 Buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // 创建用户目录
    const userDir = path.join(UPLOAD_DIR, userId.toString());
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }

    // 保存原图为 PNG（无压缩，保持最高质量）
    const filename = `${imageId}.png`;
    const filePath = path.join(userDir, filename);
    fs.writeFileSync(filePath, buffer);

    // 生成缩略图（WebP 压缩）
    const thumbnailFilename = `${imageId}_thumb.webp`;
    const thumbnailPath = path.join(userDir, thumbnailFilename);
    await sharp(buffer)
        .webp({ quality: 75 })
        .resize(400, 400, { fit: 'cover' })  // 裁剪为正方形缩略图
        .toFile(thumbnailPath);

    // 返回访问 URL
    const imageUrl = `/uploads/generated/${userId}/${filename}`;
    const thumbnailUrl = `/uploads/generated/${userId}/${thumbnailFilename}`;

    console.log(`✅ 图片已保存: ${imageUrl} (原图 PNG + 缩略图 WebP)`);

    return { url: imageUrl, thumbnailUrl };
}

/**
 * 从本地文件系统删除图片（包括缩略图）
 * @param {string} imageUrl - 图片的相对 URL
 * @returns {Promise<boolean>} 是否删除成功
 */
export async function deleteImageLocally(imageUrl) {
    // imageUrl 格式: /uploads/generated/{userId}/{imageId}.png
    if (!imageUrl.startsWith('/uploads/generated/')) {
        console.warn('⚠️ 不是本地图片路径，跳过删除:', imageUrl);
        return false;
    }

    // 去掉开头的 /，避免 path.join 将其视为绝对路径
    const relativePath = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
    const filePath = path.join(__dirname, relativePath);

    try {
        let deleted = false;

        // 删除原图
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            deleted = true;
            console.log(`✅ 已删除原图: ${imageUrl}`);
        }

        // 删除缩略图（WebP）
        const thumbnailPath = filePath.replace(/\.(png|webp)$/, '_thumb.webp');
        if (fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
            console.log(`✅ 已删除缩略图`);
        }

        return deleted;
    } catch (error) {
        console.error('❌ 本地图片删除失败:', error);
        return false;
    }
}

/**
 * 上传图片到云存储（支持 Cloudflare R2 和 阿里云 OSS）
 * @param {string} imageData - base64 图片数据或 data URL
 * @param {number} userId - 用户 ID
 * @param {string} imageId - 图片唯一 ID
 * @returns {Promise<string>} 公开访问 URL
 */
export async function uploadImageToR2(imageData, userId, imageId) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;
    const region = process.env.R2_REGION || 'auto'; // 新增：支持阿里云 region

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
        throw new Error('云存储配置不完整');
    }

    const client = new S3Client({
        region: region,
        endpoint: endpoint,
        credentials: { accessKeyId, secretAccessKey }
    });

    // 从 data URL 中提取 base64 数据
    let base64Data = imageData;
    if (imageData.startsWith('data:')) {
        base64Data = imageData.split(',')[1];
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const key = `generated/${userId}/${imageId}.png`;

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
        CacheControl: 'public, max-age=31536000, immutable'
    });

    await client.send(command);
    const imageUrl = `${publicUrl}/${key}`;
    console.log(`✅ 图片已上传到云存储: ${imageUrl}`);
    return imageUrl;
}

/**
 * 从 R2 云存储删除图片
 * @param {string} imageUrl - 图片的公开访问 URL
 * @returns {Promise<boolean>} 是否删除成功
 */
export async function deleteImageFromR2(imageUrl) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;
    const region = process.env.R2_REGION || 'auto';

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
        console.warn('⚠️ R2 配置不完整，无法删除');
        return false;
    }

    try {
        // 从公开 URL 中提取 key
        // 例如: https://pub-xxx.r2.dev/generated/1/123.png -> generated/1/123.png
        if (!imageUrl.startsWith(publicUrl)) {
            console.warn('⚠️ 不是 R2 图片 URL，跳过删除:', imageUrl);
            return false;
        }

        const key = imageUrl.replace(publicUrl + '/', '');

        const client = new S3Client({
            region: region,
            endpoint: endpoint,
            credentials: { accessKeyId, secretAccessKey }
        });

        const command = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key
        });

        await client.send(command);
        console.log(`✅ 已从 R2 删除图片: ${key}`);
        return true;
    } catch (error) {
        console.error('❌ R2 图片删除失败:', error);
        return false;
    }
}

/**
 * 检查是否启用 R2 云存储
 * @returns {boolean}
 */
export function isR2Enabled() {
    return process.env.USE_R2_STORAGE === 'true';
}

/**
 * 检查 R2 配置是否完整
 * @returns {boolean}
 */
export function isR2Configured() {
    return !!(
        process.env.R2_ENDPOINT &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET_NAME &&
        process.env.R2_PUBLIC_URL
    );
}

/**
 * 统一的图片保存接口（自动选择本地或 R2）
 * @param {string} imageData - base64 图片数据
 * @param {number} userId - 用户 ID
 * @param {string} imageId - 图片 ID
 * @returns {Promise<{url: string, thumbnailUrl?: string}>} 图片访问 URL
 */
export async function saveImage(imageData, userId, imageId) {
    // 优先使用本地存储，除非明确启用 R2
    if (isR2Enabled() && isR2Configured()) {
        try {
            const url = await uploadImageToR2(imageData, userId, imageId);
            return { url };  // R2 暂不支持缩略图
        } catch (error) {
            console.error('⚠️ R2 上传失败，回退到本地存储:', error.message);
            return await saveImageLocally(imageData, userId, imageId);
        }
    }

    // 默认使用本地存储（返回 url 和 thumbnailUrl）
    return await saveImageLocally(imageData, userId, imageId);
}

/**
 * 删除图片（自动识别本地或 R2）
 * @param {string} imageUrl - 图片 URL
 * @returns {Promise<boolean>}
 */
export async function deleteImage(imageUrl) {
    if (!imageUrl) {
        return false;
    }

    if (imageUrl.startsWith('/uploads/')) {
        return await deleteImageLocally(imageUrl);
    } else if (imageUrl.startsWith('http')) {
        // R2 URL
        return await deleteImageFromR2(imageUrl);
    }
    return false;
}

/**
 * 上传资源到 R2 云存储
 * @param {string} imageData - base64 图片数据
 * @param {string} name - 资源名称
 * @returns {Promise<{id: string, url: string}>}
 */
export async function uploadAssetToR2(imageData, name) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
        throw new Error('R2 not configured');
    }

    const client = new S3Client({
        region: 'auto',
        endpoint: endpoint,
        credentials: { accessKeyId, secretAccessKey }
    });

    // 从 data URL 中提取 base64 数据
    let base64Data = imageData;
    if (imageData.startsWith('data:')) {
        base64Data = imageData.split(',')[1];
    }

    const buffer = Buffer.from(base64Data, 'base64');

    // 生成唯一 ID
    const timestamp = Date.now();
    const id = timestamp.toString();

    // 安全的文件名
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${timestamp}_${safeName}.png`;
    const key = `assets/${filename}`;

    const uploadParams = {
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
        CacheControl: 'public, max-age=31536000'
    };

    await client.send(new PutObjectCommand(uploadParams));

    const url = `${publicUrl}/${key}`;
    console.log(`✅ 资源已上传到 R2: ${url}`);

    return { id, url };
}

/**
 * 从 R2 云存储删除资源
 * @param {string} assetUrl - 资源的公开访问 URL
 * @returns {Promise<boolean>} 是否删除成功
 */
export async function deleteAssetFromR2(assetUrl) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
        console.warn('⚠️ R2 配置不完整，无法删除资源');
        return false;
    }

    try {
        // 从公开 URL 中提取 key
        // 例如: https://pub-xxx.r2.dev/assets/123_template.png -> assets/123_template.png
        if (!assetUrl.startsWith(publicUrl)) {
            console.warn('⚠️ 不是 R2 资源 URL，跳过删除:', assetUrl);
            return false;
        }

        const key = assetUrl.replace(publicUrl + '/', '');

        const client = new S3Client({
            region: 'auto',
            endpoint: endpoint,
            credentials: { accessKeyId, secretAccessKey }
        });

        const command = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key
        });

        await client.send(command);
        console.log(`✅ 已从 R2 删除资源: ${key}`);
        return true;
    } catch (error) {
        console.error('❌ R2 资源删除失败:', error);
        return false;
    }
}

/**
 * 保存资源到本地文件系统 (原图 PNG + 缩略图 WebP)
 * @param {string} imageData - base64 图片数据
 * @param {string} name - 资源名称 (用于生成文件名)
 * @returns {Promise<{id: string, url: string, thumbnailUrl: string}>}
 */
export async function saveAssetLocally(imageData, name) {
    // 从 data URL 中提取 base64 数据
    let base64Data = imageData;
    if (imageData.startsWith('data:')) {
        base64Data = imageData.split(',')[1];
    }

    // 解码 base64 为 Buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // 生成唯一 ID
    const timestamp = Date.now();
    const id = timestamp.toString();

    // 安全的文件名（移除特殊字符）
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');

    // 保存原图为 PNG
    const filename = `${timestamp}_${safeName}.png`;
    const filePath = path.join(ASSETS_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    // 生成缩略图（WebP 压缩）
    const thumbnailFilename = `${timestamp}_thumb.webp`;
    const thumbnailPath = path.join(ASSETS_DIR, thumbnailFilename);
    await sharp(buffer)
        .webp({ quality: 75 })
        .resize(300, 300, { fit: 'cover' })  // 300x300 缩略图
        .toFile(thumbnailPath);

    // 返回访问 URL
    const url = `/uploads/assets/${filename}`;
    const thumbnailUrl = `/uploads/assets/${thumbnailFilename}`;

    console.log(`✅ 资源已保存: ${url} (原图 PNG + 缩略图 WebP)`);

    return { id, url, thumbnailUrl };
}

/**
 * 统一的资源保存接口（自动选择本地或 R2）
 * @param {string} imageData - base64 图片数据
 * @param {string} name - 资源名称
 * @returns {Promise<{id: string, url: string, thumbnailUrl?: string}>}
 */
export async function saveAsset(imageData, name) {
    // 优先使用本地存储，除非明确启用 R2
    if (isR2Enabled() && isR2Configured()) {
        try {
            const result = await uploadAssetToR2(imageData, name);
            return result; // R2 暂不支持缩略图
        } catch (error) {
            console.error('⚠️ R2 上传资源失败，回退到本地存储:', error.message);
            return await saveAssetLocally(imageData, name);
        }
    }

    // 默认使用本地存储（返回 id, url 和 thumbnailUrl）
    return await saveAssetLocally(imageData, name);
}

/**
 * 删除管理员资源（包括缩略图）
 * @param {string} assetUrl - 资源的相对 URL 或 R2 URL
 * @returns {Promise<boolean>} 是否删除成功
 */
export async function deleteAsset(assetUrl) {
    if (!assetUrl) {
        return false;
    }

    // 如果是 R2 URL，调用 R2 删除
    if (assetUrl.startsWith('http')) {
        return await deleteAssetFromR2(assetUrl);
    }

    // 本地资源格式: /uploads/assets/{filename}.png
    if (!assetUrl.startsWith('/uploads/assets/')) {
        console.warn('⚠️ 不是资源路径，跳过删除:', assetUrl);
        return false;
    }

    // 去掉开头的 /，避免 path.join 将其视为绝对路径
    const relativePath = assetUrl.startsWith('/') ? assetUrl.slice(1) : assetUrl;
    const filePath = path.join(__dirname, relativePath);

    try {
        let deleted = false;

        // 删除原图
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            deleted = true;
            console.log(`✅ 已删除资源: ${assetUrl}`);
        }

        // 删除缩略图（WebP）
        // 从文件名提取 timestamp
        const filename = path.basename(filePath);
        const match = filename.match(/^(\d+)_/);
        if (match) {
            const timestamp = match[1];
            const thumbnailPath = path.join(ASSETS_DIR, `${timestamp}_thumb.webp`);
            if (fs.existsSync(thumbnailPath)) {
                fs.unlinkSync(thumbnailPath);
                console.log(`✅ 已删除资源缩略图`);
            }
        }

        return deleted;
    } catch (error) {
        console.error('❌ 资源删除失败:', error);
        return false;
    }
}

/**
 * 定期清理过期图片
 * @param {number} daysToKeep - 保留天数
 * @param {object} db - 数据库实例（从外部传入避免循环依赖）
 * @returns {Promise<number>} 删除的图片数量
 */
export async function cleanupOldImages(daysToKeep = 30, db = null) {
    if (!db) {
        console.warn('⚠️ 清理功能需要数据库实例');
        return 0;
    }

    const cutoffTime = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);

    console.log(`🗑️ 开始清理 ${daysToKeep} 天前的图片...`);

    try {
        // 获取过期图片列表
        const oldImages = db.prepare(`
      SELECT id, url FROM generated_images 
      WHERE created_at < ?
    `).all(cutoffTime);

        let deletedCount = 0;

        // 删除物理文件
        for (const img of oldImages) {
            if (await deleteImageLocally(img.url)) {
                deletedCount++;
            }
        }

        // 删除数据库记录
        if (deletedCount > 0) {
            db.prepare('DELETE FROM generated_images WHERE created_at < ?').run(cutoffTime);
            console.log(`✅ 清理完成：删除了 ${deletedCount} 张过期图片`);
        } else {
            console.log('✅ 无需清理过期图片');
        }

        return deletedCount;
    } catch (error) {
        console.error('❌ 清理失败:', error);
        return 0;
    }
}

export default {
    saveImage,
    deleteImage,
    saveImageLocally,
    deleteImageLocally,
    uploadImageToR2,
    deleteImageFromR2,
    isR2Enabled,
    isR2Configured,
    cleanupOldImages,
    saveAsset,
    saveAssetLocally,
    uploadAssetToR2,
    deleteAsset,
    deleteAssetFromR2
};
