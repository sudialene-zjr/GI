const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const PORT = process.env.PORT || 3300;
const DATABASE_URL = process.env.DATABASE_URL;
const ROOT = path.join(__dirname, "main");

// 管理员凭证（密码使用 SHA-256 哈希）
const ADMIN_CREDENTIALS = {
  username: "adminGI",
  password_hash: crypto.createHash('sha256').update('HuaxiGI@admin').digest('hex')
};

// PostgreSQL 连接
let pool = null;
if (DATABASE_URL) {
  const { Pool: PgPool } = require("pg");
  pool = new PgPool({
    connectionString: DATABASE_URL.replace(/^postgresql\+psycopg:\/\//, "postgresql://")
  });
}

// 帮助函数
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject"
  };
  return types[ext] || "text/html; charset=utf-8";
}

// JWT-like token 生成（简化版）
function generateToken(payload) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", "admin-secret-key")
    .update(`${header}.${body}`)
    .digest("base64");
  return `${header}.${body}.${signature}`;
}

// 验证 token
function verifyToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(Buffer.from(parts[0], "base64").toString());
    const body = JSON.parse(Buffer.from(parts[1], "base64").toString());
    const signature = crypto
      .createHmac("sha256", "admin-secret-key")
      .update(`${parts[0]}.${parts[1]}`)
      .digest("base64");

    if (signature !== parts[2]) return null;

    return body;
  } catch (error) {
    return null;
  }
}

// 静态文件服务
function serveStatic(req, res) {
  const urlPath = decodeURI(req.url.split("?")[0]);
  const resolvedPath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.join(ROOT, resolvedPath);

  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      sendText(res, 404, "Not Found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": getContentType(filePath),
      "Access-Control-Allow-Origin": "*"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// 解析 JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

// 管理员登录
async function handleAdminLogin(req, res) {
  try {
    const body = await parseJsonBody(req);
    const { username, password } = body;

    const password_hash = crypto.createHash('sha256').update(password).digest('hex');

    if (username === ADMIN_CREDENTIALS.username && password_hash === ADMIN_CREDENTIALS.password_hash) {
      const token = generateToken({ username, role: "admin" });
      sendJson(res, 200, { ok: true, token });
    } else {
      sendJson(res, 401, { ok: false, message: "用户名或密码错误" });
    }
  } catch (error) {
    sendJson(res, 400, { ok: false, message: "请求格式错误" });
  }
}

// 获取满意度统计数据
async function handleGetSurveyStats(req, res) {
  const payload = verifyToken(req.headers.authorization?.replace("Bearer ", ""));
  if (!payload) {
    sendJson(res, 401, { ok: false, message: "未授权" });
    return;
  }

  try {
    // 满意度统计
    const satisfactionResult = await pool.query(`
      SELECT
        satisfaction,
        COUNT(*) as count
      FROM survey_responses
      WHERE satisfaction IS NOT NULL
      GROUP BY satisfaction
      ORDER BY satisfaction
    `);

    // 理解度统计
    const understandingResult = await pool.query(`
      SELECT
        understanding,
        COUNT(*) as count
      FROM survey_responses
      WHERE understanding IS NOT NULL
      GROUP BY understanding
      ORDER BY understanding
    `);

    // 焦虑程度统计
    const anxietyResult = await pool.query(`
      SELECT
        anxiety,
        COUNT(*) as count
      FROM survey_responses
      WHERE anxiety IS NOT NULL
      GROUP BY anxiety
      ORDER BY anxiety
    `);

    // 总体统计
    const totalResult = await pool.query(`
      SELECT
        COUNT(*) as total_surveys,
        AVG(satisfaction) as avg_satisfaction,
        AVG(understanding) as avg_understanding
      FROM survey_responses
    `);

    // 最近30天趋势
    const trendResult = await pool.query(`
      SELECT
        DATE(created_at) as date,
        AVG(satisfaction) as avg_satisfaction,
        AVG(understanding) as avg_understanding,
        COUNT(*) as count
      FROM survey_responses
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // 年龄分布
    const ageDistributionResult = await pool.query(`
      SELECT
        CASE
          WHEN (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM TO_DATE(UP.birth_month, 'YYYY-MM'))) < 30 THEN '30岁以下'
          WHEN (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM TO_DATE(UP.birth_month, 'YYYY-MM'))) BETWEEN 30 AND 39 THEN '30-39岁'
          WHEN (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM TO_DATE(UP.birth_month, 'YYYY-MM'))) BETWEEN 40 AND 49 THEN '40-49岁'
          WHEN (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM TO_DATE(UP.birth_month, 'YYYY-MM'))) BETWEEN 50 AND 59 THEN '50-59岁'
          ELSE '60岁及以上'
        END as age_range,
        COUNT(*) as count
      FROM survey_responses SR
      JOIN user_profiles UP ON SR.user_id = UP.user_id
      WHERE SR.created_at IS NOT NULL
      GROUP BY
        CASE
          WHEN (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM TO_DATE(UP.birth_month, 'YYYY-MM'))) < 30 THEN '30岁以下'
          WHEN (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM TO_DATE(UP.birth_month, 'YYYY-MM'))) BETWEEN 30 AND 39 THEN '30-39岁'
          WHEN (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM TO_DATE(UP.birth_month, 'YYYY-MM'))) BETWEEN 40 AND 49 THEN '40-49岁'
          WHEN (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM TO_DATE(UP.birth_month, 'YYYY-MM'))) BETWEEN 50 AND 59 THEN '50-59岁'
          ELSE '60岁及以上'
        END
      ORDER BY
        CASE
          WHEN (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM TO_DATE(UP.birth_month, 'YYYY-MM'))) < 30 THEN '30岁以下'
          WHEN (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM TO_DATE(UP.birth_month, 'YYYY-MM'))) BETWEEN 30 AND 39 THEN '30-39岁'
          WHEN (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM TO_DATE(UP.birth_month, 'YYYY-MM'))) BETWEEN 40 AND 49 THEN '40-49岁'
          WHEN (EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM TO_DATE(UP.birth_month, 'YYYY-MM'))) BETWEEN 50 AND 59 THEN '50-59岁'
          ELSE '60岁及以上'
        END
    `);

    console.log('返回统计数据:', {
      satisfactionCount: satisfactionResult.rows.length,
      understandingCount: understandingResult.rows.length,
      anxietyCount: anxietyResult.rows.length,
      ageDistributionCount: ageDistributionResult.rows.length
    });

    sendJson(res, 200, {
      ok: true,
      satisfaction: satisfactionResult.rows,
      understanding: understandingResult.rows,
      anxiety: anxietyResult.rows,
      overview: totalResult.rows[0] || {},
      trend: trendResult.rows,
      ageDistribution: ageDistributionResult.rows
    });
  } catch (error) {
    console.error("获取统计失败:", error.message);
    console.error("错误堆栈:", error.stack);
    sendJson(res, 500, { ok: false, message: "服务器错误" });
  }
}

// 获取用户详情
async function handleGetUserDetail(req, res) {
  try {
    const urlParts = req.url.split("/");
    const userId = urlParts[urlParts.length - 1];

    if (!userId || userId === "user") {
      sendJson(res, 400, { ok: false, message: "用户ID不能为空" });
      return;
    }

    console.log('查询用户详情, userId:', userId);

    const query = `
      SELECT
        u.id,
        u.account,
        u.name,
        up.phone,
        up.birth_month,
        up.gender,
        up.education,
        u.created_at
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.id = $1
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      sendJson(res, 404, { ok: false, message: "用户不存在" });
      return;
    }

    console.log('用户详情查询成功:', {
      userId,
      hasData: true,
      userName: result.rows[0].name
    });

    sendJson(res, 200, {
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error("获取用户详情失败:", error);
    sendJson(res, 500, { ok: false, message: "服务器错误" });
  }
}

// 获取调查详情列表
async function handleGetSurveyList(req, res) {
  const payload = verifyToken(req.headers.authorization?.replace("Bearer ", ""));
  if (!payload) {
    sendJson(res, 401, { ok: false, message: "未授权" });
    return;
  }

  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const page = parseInt(requestUrl.searchParams.get("page") || "1");
    const pageSize = parseInt(requestUrl.searchParams.get("pageSize") || "20");
    const offset = (page - 1) * pageSize;

    const result = await pool.query(`
      SELECT
        sr.id,
        sr.user_id,
        u.name as user_name,
        up.phone,
        sr.satisfaction,
        sr.understanding,
        sr.anxiety,
        sr.compliance,
        sr.helpful,
        sr.suggestion,
        sr.created_at
      FROM survey_responses sr
      LEFT JOIN users u ON sr.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      ORDER BY sr.created_at DESC
      LIMIT $1 OFFSET $2
    `, [pageSize, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM survey_responses
    `);

    sendJson(res, 200, {
      ok: true,
      data: result.rows,
      pagination: {
        page,
        pageSize,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / pageSize)
      }
    });
  } catch (error) {
    console.error("获取列表失败:", error);
    sendJson(res, 500, { ok: false, message: "服务器错误" });
  }
}

// 获取用户AI交互记录
async function handleGetGiMessages(req, res) {
  const payload = verifyToken(req.headers.authorization?.replace("Bearer ", ""));
  if (!payload) {
    sendJson(res, 401, { ok: false, message: "未授权" });
    return;
  }

  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const page = parseInt(requestUrl.searchParams.get("page") || "1");
    const pageSize = parseInt(requestUrl.searchParams.get("pageSize") || "20");
    const userId = requestUrl.searchParams.get("userId");
    const isGuestParam = requestUrl.searchParams.get("isGuest");
    const offset = (page - 1) * pageSize;

    console.log('查询 gi_messages:', { page, pageSize, userId, isGuestParam, offset });

    let query = `
      SELECT
        gm.id,
        gm.session_id,
        gm.is_guest,
        gm.user_id,
        u.name as user_name,
        u.account as user_account,
        gm.role,
        gm.content,
        gm.title,
        gm.risk_level,
        gm.created_at
      FROM gi_messages gm
      LEFT JOIN users u ON gm.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND gm.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    // 处理用户类型筛选（只有明确指定参数时才筛选）
    if (isGuestParam === 'true') {
      query += ` AND gm.is_guest = true`;
    } else if (isGuestParam === 'false') {
      query += ` AND gm.is_guest = false`;
    }

    query += ` ORDER BY gm.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(pageSize, offset);

    const result = await pool.query(query, params);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM gi_messages gm
      WHERE 1=1
      ${userId ? ' AND gm.user_id = $1' : ''}
      ${isGuestParam === 'true' ? ' AND gm.is_guest = true' : ''}
      ${isGuestParam === 'false' ? ' AND gm.is_guest = false' : ''}
    `;
    const countParams = userId ? [userId] : [];
    const countResult = await pool.query(countQuery, countParams);

    console.log('gi_messages 查询结果:', {
      rowCount: result.rowCount,
      total: countResult.rows[0].total,
      firstRow: result.rows[0]
    });

    // 对内容进行脱敏处理
    const maskedMessages = result.rows.map(msg => ({
      ...msg,
      content: msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content
    }));

    sendJson(res, 200, {
      ok: true,
      data: maskedMessages,
      pagination: {
        page,
        pageSize,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / pageSize)
      }
    });
  } catch (error) {
    console.error("获取AI交互记录失败:", error);
    sendJson(res, 500, { ok: false, message: "服务器错误" });
  }
}

// 主服务器
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // API 路由
  if (req.url.startsWith("/api")) {
    if (req.method === "POST" && req.url === "/api/admin/login") {
      await handleAdminLogin(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/api/admin/survey-stats") {
      await handleGetSurveyStats(req, res);
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/admin/surveys")) {
      await handleGetSurveyList(req, res);
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/admin/messages")) {
      await handleGetGiMessages(req, res);
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/admin/user/")) {
      await handleGetUserDetail(req, res);
      return;
    }

    sendJson(res, 404, { ok: false, message: "API not found" });
    return;
  }

  // 静态文件
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Admin server running at http://localhost:${PORT}`);
});
