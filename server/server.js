const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(__dirname, "..");
const MAX_BODY_SIZE = 1e6; // 1MB
const RAW_DATABASE_URL = process.env.DATABASE_URL || "";
const DATABASE_URL = RAW_DATABASE_URL.replace(/^postgresql\+psycopg:\/\//, "postgresql://");
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL. Please set it before starting the server.");
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET. Please set it before starting the server.");
  process.exit(1);
}
const JWT_ISSUER = "gi-edu";
const JWT_EXPIRES_IN = "7d";
const useSSL = !/localhost|127\.0\.0\.1/.test(DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const hashedBuffer = crypto.scryptSync(password, salt, 64);
  const hashBuffer = Buffer.from(hash, "hex");
  if (hashedBuffer.length !== hashBuffer.length) return false;
  return crypto.timingSafeEqual(hashedBuffer, hashBuffer);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(text);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

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

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        const data = JSON.parse(body);
        resolve(data);
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function normalizeAccount(account) {
  return account.trim().toLowerCase();
}

function handleDbError(res, error) {
  if (error && error.code === "42P01") {
    sendJson(res, 500, { ok: false, error: "数据库未初始化，请先执行 init.sql" });
    return;
  }
  if (error && error.code === "28P01") {
    sendJson(res, 500, { ok: false, error: "数据库认证失败，请检查账号密码" });
    return;
  }
  sendJson(res, 500, { ok: false, error: "服务器内部错误" });
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, name: user.name, account: user.account },
    JWT_SECRET,
    { issuer: JWT_ISSUER, expiresIn: JWT_EXPIRES_IN }
  );
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function verifyToken(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { ok: false, error: "未登录" });
    return null;
  }
  try {
    return jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER });
  } catch {
    sendJson(res, 401, { ok: false, error: "登录已过期" });
    return null;
  }
}

async function handleRegister(req, res) {
  try {
    const { name, account, password, confirmPassword } = await parseJsonBody(req);
    if (!name || !account || !password || !confirmPassword) {
      sendJson(res, 400, { ok: false, error: "请完整填写注册信息" });
      return;
    }
    if (password !== confirmPassword) {
      sendJson(res, 400, { ok: false, error: "两次输入的密码不一致" });
      return;
    }
    if (String(password).length < 6) {
      sendJson(res, 400, { ok: false, error: "密码至少6位" });
      return;
    }
    const normalized = normalizeAccount(String(account));
    const { salt, hash } = hashPassword(String(password));
    const result = await pool.query(
      `INSERT INTO users (name, account, account_lower, password_hash, password_salt)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, account`,
      [String(name).trim(), String(account).trim(), normalized, hash, salt]
    );
    const user = result.rows[0];
    const token = signToken(user);
    sendJson(res, 200, { ok: true, user, token });
  } catch (error) {
    if (error && error.code === "23505") {
      sendJson(res, 409, { ok: false, error: "账号已存在" });
      return;
    }
    if (error && (error.message === "Invalid JSON" || error.message === "Body too large")) {
      sendJson(res, 400, { ok: false, error: "请求格式有误" });
      return;
    }
    console.error("Register error:", error);
    handleDbError(res, error);
  }
}

async function handleLogin(req, res) {
  try {
    const { account, password } = await parseJsonBody(req);
    if (!account || !password) {
      sendJson(res, 400, { ok: false, error: "请输入账号和密码" });
      return;
    }
    const normalized = normalizeAccount(String(account));
    const result = await pool.query(
      `SELECT id, name, account, password_hash, password_salt
       FROM users
       WHERE account_lower = $1`,
      [normalized]
    );
    const user = result.rows[0];
    if (!user || !verifyPassword(String(password), user.password_salt, user.password_hash)) {
      sendJson(res, 401, { ok: false, error: "账号或密码错误" });
      return;
    }
    const safeUser = { id: user.id, name: user.name, account: user.account };
    const token = signToken(safeUser);
    sendJson(res, 200, { ok: true, user: safeUser, token });
  } catch (error) {
    if (error && (error.message === "Invalid JSON" || error.message === "Body too large")) {
      sendJson(res, 400, { ok: false, error: "请求格式有误" });
      return;
    }
    console.error("Login error:", error);
    handleDbError(res, error);
  }
}

async function handleMe(req, res) {
  const payload = verifyToken(req, res);
  if (!payload) return;
  try {
    const result = await pool.query(
      "SELECT id, name, account FROM users WHERE id = $1",
      [payload.sub]
    );
    const user = result.rows[0];
    if (!user) {
      sendJson(res, 401, { ok: false, error: "用户不存在" });
      return;
    }
    sendJson(res, 200, { ok: true, user });
  } catch (error) {
    console.error("Me error:", error);
    handleDbError(res, error);
  }
}

async function handleGetProfile(req, res) {
  const payload = verifyToken(req, res);
  if (!payload) return;
  try {
    const profileResult = await pool.query(
      `SELECT name, birth_month AS birth, gender, education, phone, updated_at
       FROM user_profiles WHERE user_id = $1`,
      [payload.sub]
    );
    sendJson(res, 200, { ok: true, profile: profileResult.rows[0] || null });
  } catch (error) {
    console.error("Get profile error:", error);
    handleDbError(res, error);
  }
}

async function handleSaveProfile(req, res) {
  try {
    const payload = verifyToken(req, res);
    if (!payload) return;
    const { profile } = await parseJsonBody(req);
    if (!profile) {
      sendJson(res, 400, { ok: false, error: "请完整填写资料" });
      return;
    }
    const { name, birth, gender, education, phone } = profile;
    if (!name || !birth || !gender || !education || !phone) {
      sendJson(res, 400, { ok: false, error: "请完整填写资料" });
      return;
    }
    const client = await pool.connect();
    try {
      const userResult = await client.query("SELECT id FROM users WHERE id = $1", [payload.sub]);
      if (userResult.rowCount === 0) {
        sendJson(res, 404, { ok: false, error: "用户不存在" });
        return;
      }
      const profileResult = await client.query(
        `INSERT INTO user_profiles (user_id, name, birth_month, gender, education, phone, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (user_id)
         DO UPDATE SET
           name = EXCLUDED.name,
           birth_month = EXCLUDED.birth_month,
           gender = EXCLUDED.gender,
           education = EXCLUDED.education,
           phone = EXCLUDED.phone,
           updated_at = now()
         RETURNING name, birth_month AS birth, gender, education, phone, updated_at`,
        [payload.sub, String(name).trim(), String(birth), String(gender), String(education), String(phone).trim()]
      );
      await client.query("UPDATE users SET name = $2 WHERE id = $1", [payload.sub, String(name).trim()]);
      sendJson(res, 200, { ok: true, profile: profileResult.rows[0] });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error && (error.message === "Invalid JSON" || error.message === "Body too large")) {
      sendJson(res, 400, { ok: false, error: "请求格式有误" });
      return;
    }
    console.error("Save profile error:", error);
    handleDbError(res, error);
  }
}

async function handleSaveSurvey(req, res) {
  try {
    const payload = verifyToken(req, res);
    if (!payload) return;
    const body = await parseJsonBody(req);
    const satisfaction = Number(body.satisfaction);
    const understanding = Number(body.understanding);
    const anxiety = String(body.anxiety || "").trim();
    const helpful = String(body.helpful || "").trim();
    const compliance = Array.isArray(body.compliance) ? body.compliance : [];
    const suggestion = String(body.suggestion || "").trim();

    if (!satisfaction || !understanding || !anxiety || !helpful) {
      sendJson(res, 400, { ok: false, error: "请完整填写问卷" });
      return;
    }
    if (satisfaction < 1 || satisfaction > 5 || understanding < 1 || understanding > 5) {
      sendJson(res, 400, { ok: false, error: "评分范围应为1-5" });
      return;
    }

    await pool.query(
      `INSERT INTO survey_responses
        (user_id, satisfaction, understanding, anxiety, compliance, helpful, suggestion)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [payload.sub, satisfaction, understanding, anxiety, JSON.stringify(compliance), helpful, suggestion || null]
    );

    sendJson(res, 200, { ok: true });
  } catch (error) {
    if (error && (error.message === "Invalid JSON" || error.message === "Body too large")) {
      sendJson(res, 400, { ok: false, error: "请求格式有误" });
      return;
    }
    console.error("Save survey error:", error);
    handleDbError(res, error);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    res.end();
    return;
  }

  if (req.url.startsWith("/api/")) {
    if (req.method === "POST" && req.url === "/api/register") {
      await handleRegister(req, res);
      return;
    }
    if (req.method === "POST" && req.url === "/api/login") {
      await handleLogin(req, res);
      return;
    }
    if (req.method === "GET" && req.url === "/api/me") {
      await handleMe(req, res);
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/api/profile")) {
      await handleGetProfile(req, res);
      return;
    }
    if (req.method === "POST" && req.url === "/api/profile") {
      await handleSaveProfile(req, res);
      return;
    }
    if (req.method === "POST" && req.url === "/api/survey") {
      await handleSaveSurvey(req, res);
      return;
    }
    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, { ok: true, status: "ok" });
      return;
    }
    sendJson(res, 404, { ok: false, error: "接口不存在" });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
