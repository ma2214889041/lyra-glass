import crypto from 'crypto';
import { promisify } from 'util';
import { sessionDb, userDb } from './db.js';

const scryptAsync = promisify(crypto.scrypt);

// 生成随机 token
export const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// 密码哈希
export const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
};

// 验证密码
export const verifyPassword = async (password, hash) => {
  const [salt, key] = hash.split(':');
  const derivedKey = await scryptAsync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
};

// 验证管理员凭据
export const validateAdminCredentials = (username, password) => {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  return username === adminUsername && password === adminPassword;
};

// 用户注册
export const register = async (username, password) => {
  // 检查用户名是否已存在
  if (userDb.usernameExists(username)) {
    return { error: '用户名已存在' };
  }

  // 用户名验证
  if (username.length < 3 || username.length > 20) {
    return { error: '用户名长度需在3-20字符之间' };
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
    return { error: '用户名只能包含字母、数字、下划线和中文' };
  }

  // 密码验证
  if (password.length < 6) {
    return { error: '密码长度至少6位' };
  }

  // 创建用户
  const passwordHash = await hashPassword(password);
  const user = userDb.create(username, passwordHash);

  // 自动登录
  const token = generateToken();
  const session = sessionDb.create(token, username, 24 * 7, user.id, 'user'); // 7天有效

  return {
    success: true,
    token: session.token,
    user: { id: user.id, username: user.username, role: user.role },
    expiresAt: session.expiresAt
  };
};

// 普通用户登录
export const userLogin = async (username, password) => {
  const user = userDb.findByUsername(username);
  if (!user) {
    return null;
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return null;
  }

  const token = generateToken();
  const session = sessionDb.create(token, username, 24 * 7, user.id, user.role); // 7天有效

  return {
    token: session.token,
    user: { id: user.id, username: user.username, role: user.role },
    expiresAt: session.expiresAt
  };
};

// 管理员登录
export const adminLogin = (username, password) => {
  if (!validateAdminCredentials(username, password)) {
    return null;
  }

  const token = generateToken();
  // 管理员的 user_id 为 null（不关联到 users 表）
  const session = sessionDb.create(token, username, 24, null, 'admin'); // 24小时有效
  return {
    token: session.token,
    user: { id: null, username, role: 'admin' },
    expiresAt: session.expiresAt
  };
};

// 统一登录（先尝试普通用户，再尝试管理员）
export const login = async (username, password) => {
  // 先尝试普通用户登录
  const userResult = await userLogin(username, password);
  if (userResult) {
    return userResult;
  }

  // 再尝试管理员登录
  const adminResult = adminLogin(username, password);
  if (adminResult) {
    return adminResult;
  }

  return null;
};

// 修改密码
export const changePassword = async (userId, oldPassword, newPassword) => {
  // 获取用户
  const user = userDb.findByUsername(userDb.findById(userId)?.username);
  if (!user) {
    return { error: '用户不存在' };
  }

  // 验证旧密码
  const isValid = await verifyPassword(oldPassword, user.password_hash);
  if (!isValid) {
    return { error: '当前密码错误' };
  }

  // 验证新密码
  if (newPassword.length < 6) {
    return { error: '新密码长度至少6位' };
  }

  // 更新密码
  const newHash = await hashPassword(newPassword);
  const updated = userDb.updatePassword(userId, newHash);
  if (!updated) {
    return { error: '密码更新失败' };
  }

  return { success: true };
};

// 登出
export const logout = (token) => {
  return sessionDb.delete(token);
};

// 验证 session
export const validateSession = (token) => {
  return sessionDb.validate(token);
};

// 认证中间件（要求登录）
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权访问' });
  }

  const token = authHeader.substring(7);
  const session = validateSession(token);

  if (!session) {
    return res.status(401).json({ error: 'Session 已过期，请重新登录' });
  }

  req.user = session;
  next();
};

// 可选认证中间件（不强制登录，但会附加用户信息）
export const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const session = validateSession(token);
    if (session) {
      req.user = session;
    }
  }

  next();
};

// 管理员认证中间件
export const adminMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权访问' });
  }

  const token = authHeader.substring(7);
  const session = validateSession(token);

  if (!session) {
    return res.status(401).json({ error: 'Session 已过期，请重新登录' });
  }

  if (session.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }

  req.user = session;
  next();
};
