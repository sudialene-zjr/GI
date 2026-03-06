const viewButtons = document.querySelectorAll("[data-view]");
const views = document.querySelectorAll(".view");
const navLinks = document.querySelectorAll(".nav-link");

const authTabs = document.querySelectorAll("[data-auth]");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-text");
const chatWindow = document.getElementById("chat-window");
const chatHistoryListEl = document.getElementById("chat-history-list");
const chatHistoryEmptyEl = document.getElementById("chat-history-empty");
const clearChatHistoryButton = document.getElementById("clear-chat-history");
const promptButtons = document.querySelectorAll("[data-prompt]");
const surveyForm = document.getElementById("survey-form");
const surveyToast = document.getElementById("survey-toast");
const learnTabs = document.querySelectorAll("[data-learn]");
const learnViews = document.querySelectorAll("[data-learn-view]");
const articleList = document.getElementById("article-list");
const passwordToggles = document.querySelectorAll("[data-toggle]");
const profileForm = document.getElementById("profile-form");
const profileAvatarEl = document.getElementById("profile-avatar");
const profileNameEl = document.getElementById("profile-name");
const profileMetaEl = document.getElementById("profile-meta");
const profileAccountEl = document.getElementById("profile-account");
const profileBirthEl = document.getElementById("profile-birth");
const profileGenderEl = document.getElementById("profile-gender");
const profileEducationEl = document.getElementById("profile-education");
const profilePhoneEl = document.getElementById("profile-phone");
const profileGuestEl = document.getElementById("profile-guest");
const profileContentEl = document.getElementById("profile-content");
const logoutLink = document.getElementById("logout-link");
const surveyStatusEl = document.getElementById("survey-status");
const surveyProgressLabelEl = document.getElementById("survey-progress-label");
const surveyProgressValueEl = document.getElementById("survey-progress-value");
const surveyEntryButtonEl = document.getElementById("survey-entry-button");

const CHAT_API_URL = window.CHAT_API_URL || "http://127.0.0.1:8000/v1/chat";
const CHAT_GUEST_STORAGE_KEY = "gi_chat_history_guest_v1";
const CHAT_MAX_ITEMS = 120;
const CHAT_CONTEXT_WINDOW = 12;
const DEFAULT_BOT_MESSAGE = {
  role: "assistant",
  title: "术前教育提示",
  content: "检查前需遵循禁食禁饮要求，具体时长请告知检查时间，我可以帮你生成个性化方案。",
  riskLevel: "normal"
};

let surveyCached = null;
let profileCached = null;
let chatRecords = [];

let surveyToastTimer;

function setView(viewId) {
  const navTarget = viewId === "survey" ? "profile" : viewId;
  views.forEach((view) => {
    view.classList.toggle("is-active", view.id === viewId);
  });

  navLinks.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === navTarget);
  });
}

viewButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const viewId = btn.dataset.view;
    if (viewId) {
      setView(viewId);
    }
  });
});

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    authTabs.forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    const isLogin = tab.dataset.auth === "login";
    loginForm.classList.toggle("is-hidden", !isLogin);
    registerForm.classList.toggle("is-hidden", isLogin);
    if (loginForm) {
      setFormMessage(loginForm, "");
    }
    if (registerForm) {
      setFormMessage(registerForm, "");
    }
  });
});

passwordToggles.forEach((toggle) => {
  const targetId = toggle.dataset.toggle;
  const input = document.getElementById(targetId);
  if (!input) return;
  toggle.addEventListener("click", () => {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    toggle.textContent = isPassword ? "隐藏" : "显示";
    toggle.setAttribute("aria-pressed", String(isPassword));
  });
});

function setFormMessage(form, message, type = "error") {
  if (!form) return;
  const messageBox = form.querySelector(".form-message");
  if (!messageBox) return;
  messageBox.textContent = message || "";
  messageBox.classList.remove("is-error", "is-success");
  if (message) {
    messageBox.classList.add(type === "success" ? "is-success" : "is-error");
  }
}

function getStoredUser() {
  try {
    const raw = window.localStorage.getItem("gi_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeUser(user) {
  if (!user) return;
  window.localStorage.setItem("gi_user", JSON.stringify(user));
}

function clearStoredUser() {
  window.localStorage.removeItem("gi_user");
}

function getToken() {
  return window.localStorage.getItem("gi_token");
}

function storeToken(token) {
  if (!token) return;
  window.localStorage.setItem("gi_token", token);
}

function clearToken() {
  window.localStorage.removeItem("gi_token");
}

function getGuestChatHistory() {
  try {
    const raw = window.localStorage.getItem(CHAT_GUEST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setGuestChatHistory(records) {
  const list = Array.isArray(records) ? records.slice(-CHAT_MAX_ITEMS) : [];
  window.localStorage.setItem(CHAT_GUEST_STORAGE_KEY, JSON.stringify(list));
}

function normalizeChatRecord(record) {
  const role = String(record?.role || "").toLowerCase();
  const normalizedRole = role === "assistant" || role === "bot" ? "assistant" : "user";
  const content = String(record?.content || record?.text || "").trim();
  if (!content) return null;
  return {
    role: normalizedRole,
    content,
    title: record?.title ? String(record.title).trim() : "",
    riskLevel: record?.riskLevel
      ? String(record.riskLevel).trim()
      : (record?.risk_level ? String(record.risk_level).trim() : "normal"),
    createdAt: record?.createdAt || record?.created_at || new Date().toISOString()
  };
}

function toAgentHistory(records) {
  return records
    .slice(-CHAT_CONTEXT_WINDOW)
    .map((item) => {
      const normalized = normalizeChatRecord(item);
      if (!normalized) return null;
      return {
        role: normalized.role,
        content: normalized.content
      };
    })
    .filter(Boolean);
}

async function postJson(url, payload, useAuth = false) {
  const headers = { "Content-Type": "application/json" };
  if (useAuth) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function escapeHtml(value) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(value || '').replace(/[&<>"']/g, (ch) => map[ch]);
}

function renderMarkdown(text) {
  const raw = String(text || '');
  if (window.marked) {
    if (!window.marked._giConfigured) {
      window.marked.setOptions({ breaks: true });
      window.marked._giConfigured = true;
    }
    const html = window.marked.parse(raw);
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(html);
    }
    return html;
  }
  return escapeHtml(raw).replace(/\n/g, '<br>');
}

function buildChatPayload(question, historyRecords = []) {
  const payload = { question };
  const history = toAgentHistory(historyRecords);
  if (history.length > 0) {
    payload.history = history;
  }
  const user = getStoredUser();
  if (user) {
    payload.user = {
      id: user.id || undefined,
      name: user.name || undefined,
      account: user.account || undefined
    };
  }
  if (profileCached) {
    payload.profile = { ...profileCached };
  }
  if (surveyCached) {
    payload.survey = { ...surveyCached };
  }
  return payload;
}

function updateBotMessage(messageEl, { title, text }) {
  if (!messageEl) return;
  const bubble = messageEl.querySelector('.bubble');
  if (!bubble) return;
  const textEl = messageEl.querySelector('.bubble-text');
  if (textEl) {
    textEl.innerHTML = renderMarkdown(text);
  }
  if (title) {
    let titleEl = messageEl.querySelector('.bubble-title');
    if (!titleEl) {
      titleEl = document.createElement('div');
      titleEl.className = 'bubble-title';
      bubble.insertBefore(titleEl, bubble.firstChild);
    }
    titleEl.textContent = title;
  }
}

async function getJson(url, useAuth = false) {
  const headers = {};
  if (useAuth) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  const response = await fetch(url, { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function applySurveyToForm(survey) {
  if (!surveyForm || !survey) return;
  const setRadio = (name, value) => {
    const input = surveyForm.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  };
  setRadio("satisfaction", String(survey.satisfaction));
  setRadio("understanding", String(survey.understanding));
  setRadio("anxiety", survey.anxiety);
  setRadio("helpful", survey.helpful);

  if (Array.isArray(survey.compliance)) {
    surveyForm
      .querySelectorAll('input[name="compliance"]')
      .forEach((input) => {
        input.checked = survey.compliance.includes(input.value);
      });
  }

  const suggestionEl = surveyForm.querySelector('textarea[name="suggestion"]');
  if (suggestionEl) {
    suggestionEl.value = survey.suggestion || "";
  }
}

function updateSurveyCard(survey) {
  if (!surveyStatusEl || !surveyProgressLabelEl || !surveyProgressValueEl || !surveyEntryButtonEl) {
    return;
  }
  if (survey) {
    surveyStatusEl.textContent = "已完成问卷填写，可随时修改答案。";
    surveyProgressLabelEl.textContent = "已完成";
    surveyProgressValueEl.textContent = "1 份";
    surveyEntryButtonEl.textContent = "修改问卷";
  } else {
    surveyStatusEl.textContent = "请在检查后3天内填写，帮助我们优化术前教育与AI问答体验。";
    surveyProgressLabelEl.textContent = "待填写";
    surveyProgressValueEl.textContent = "1 份";
    surveyEntryButtonEl.textContent = "进入问卷";
  }
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const account = loginForm.elements.account?.value.trim();
    const password = loginForm.elements.password?.value || "";
    if (!account || !password) {
      setFormMessage(loginForm, "请输入账号和密码");
      return;
    }
    setFormMessage(loginForm, "");
    try {
      const data = await postJson("/api/login", { account, password });
      if (data?.token) {
        storeToken(data.token);
      }
      if (data?.user) {
        storeUser(data.user);
      }
      setFormMessage(loginForm, "登录成功，正在进入系统...", "success");
      setTimeout(() => {
        window.location.href = "app.html";
      }, 800);
    } catch (error) {
      setFormMessage(loginForm, error.message || "登录失败");
    }
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = registerForm.elements.name?.value.trim();
    const account = registerForm.elements.account?.value.trim();
    const password = registerForm.elements.password?.value || "";
    const confirmPassword = registerForm.elements.confirmPassword?.value || "";
    if (!name || !account || !password || !confirmPassword) {
      setFormMessage(registerForm, "请完整填写注册信息");
      return;
    }
    if (password !== confirmPassword) {
      setFormMessage(registerForm, "两次输入的密码不一致");
      return;
    }
    setFormMessage(registerForm, "");
    try {
      const data = await postJson("/api/register", {
        name,
        account,
        password,
        confirmPassword
      });
      if (data?.token) {
        storeToken(data.token);
      }
      if (data?.user) {
        storeUser(data.user);
      }
      setFormMessage(registerForm, "注册成功，正在进入系统...", "success");
      setTimeout(() => {
        window.location.href = "app.html";
      }, 900);
    } catch (error) {
      setFormMessage(registerForm, error.message || "注册失败");
    }
  });
}

function formatBirth(value) {
  if (!value) return "待填写";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${year}年${month}月`;
}

function maskPhone(value) {
  const raw = String(value || "").replace(/\\s+/g, "");
  if (raw.length < 7) return raw || "待填写";
  return `${raw.slice(0, 3)}****${raw.slice(-4)}`;
}

function updateProfileDisplay(profile = {}) {
  const hasName = Boolean(profile.name);
  const name = profile.name || "待填写";
  if (profileNameEl) profileNameEl.textContent = name;
  if (profileAvatarEl) {
    const firstChar = hasName ? String(name).trim().charAt(0) || "人" : "人";
    profileAvatarEl.textContent = firstChar;
  }
  if (profileMetaEl) {
    profileMetaEl.textContent = profile.name ? "个人资料" : "资料待完善";
  }
  if (profileAccountEl) {
    profileAccountEl.textContent = profile.account || "待填写";
  }
  if (profileBirthEl) profileBirthEl.textContent = formatBirth(profile.birth);
  if (profileGenderEl) profileGenderEl.textContent = profile.gender || "待填写";
  if (profileEducationEl)
    profileEducationEl.textContent = profile.education || "待填写";
  if (profilePhoneEl) profilePhoneEl.textContent = maskPhone(profile.phone);
}

async function loadProfile() {
  if (!profileForm) return;
  const token = getToken();
  const isGuest = !token;
  if (profileGuestEl) profileGuestEl.classList.toggle("is-hidden", !isGuest);
  if (profileContentEl) profileContentEl.classList.toggle("is-hidden", isGuest);
  if (isGuest) {
    profileCached = null;
    updateProfileDisplay({});
    return;
  }

  try {
    const meData = await getJson("/api/me", true);
    const user = meData.user;
    if (user) {
      storeUser(user);
      const nameField = profileForm.elements.name;
      if (nameField && !nameField.value) {
        nameField.value = user.name || "";
      }
    }

    try {
      const profileData = await getJson("/api/profile", true);
      if (profileData?.profile) {
        const profile = profileData.profile;
        profileCached = profile;
        if (profileForm.elements.name) profileForm.elements.name.value = profile.name || user.name || "";
        if (profileForm.elements.birth) profileForm.elements.birth.value = profile.birth || "";
        if (profileForm.elements.gender) profileForm.elements.gender.value = profile.gender || "";
        if (profileForm.elements.education) profileForm.elements.education.value = profile.education || "";
        if (profileForm.elements.phone) profileForm.elements.phone.value = profile.phone || "";
        updateProfileDisplay({ ...profile, account: user.account });
      } else {
        profileCached = null;
        updateProfileDisplay({ name: user.name || "", account: user.account });
      }
    } catch {
      profileCached = null;
      updateProfileDisplay({ name: user.name || "", account: user.account });
    }
  } catch (error) {
    profileCached = null;
    clearToken();
    clearStoredUser();
    if (profileGuestEl) profileGuestEl.classList.remove("is-hidden");
    if (profileContentEl) profileContentEl.classList.add("is-hidden");
    updateProfileDisplay({});
  }
}

async function loadSurveyStatus() {
  const token = getToken();
  if (!token) {
    updateSurveyCard(null);
    return;
  }
  try {
    const data = await getJson("/api/survey", true);
    if (data?.survey) {
      surveyCached = data.survey;
      updateSurveyCard(surveyCached);
      applySurveyToForm(surveyCached);
    } else {
      surveyCached = null;
      updateSurveyCard(null);
    }
  } catch {
    updateSurveyCard(null);
  }
}

function renderHistorySummary() {
  if (!chatHistoryListEl || !chatHistoryEmptyEl) return;
  const recentQuestions = chatRecords
    .filter((item) => item.role === "user")
    .slice(-6)
    .reverse();
  chatHistoryListEl.innerHTML = "";
  if (recentQuestions.length === 0) {
    chatHistoryEmptyEl.classList.remove("is-hidden");
    return;
  }
  chatHistoryEmptyEl.classList.add("is-hidden");
  recentQuestions.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.content;
    chatHistoryListEl.appendChild(li);
  });
}

function renderChatRecords() {
  if (!chatWindow) return;
  chatWindow.innerHTML = "";
  const records = chatRecords.map((item) => ({
    role: item.role === "assistant" ? "bot" : "user",
    title: item.title || (item.role === "assistant" ? "医疗建议" : ""),
    text: item.content
  }));
  if (records.length === 0) {
    records.push({
      role: "bot",
      title: DEFAULT_BOT_MESSAGE.title,
      text: DEFAULT_BOT_MESSAGE.content
    });
  }
  records.forEach((item) => appendMessage(item));
}

function applyChatRecords(records, shouldRender = true) {
  chatRecords = records
    .map((item) => normalizeChatRecord(item))
    .filter(Boolean)
    .slice(-CHAT_MAX_ITEMS);
  renderHistorySummary();
  if (shouldRender) {
    renderChatRecords();
  }
}

function appendChatRecord(record, options = { persist: true }) {
  const normalized = normalizeChatRecord(record);
  if (!normalized) return;
  chatRecords = [...chatRecords, normalized].slice(-CHAT_MAX_ITEMS);
  renderHistorySummary();
  if (getToken()) {
    if (options.persist) {
      postJson(
        "/api/chat/history",
        {
          role: normalized.role,
          content: normalized.content,
          title: normalized.title || undefined,
          riskLevel: normalized.riskLevel || "normal"
        },
        true
      ).catch(() => {});
    }
    return;
  }
  setGuestChatHistory(chatRecords);
}

async function loadChatHistory() {
  if (!chatWindow) return;
  const token = getToken();
  if (!token) {
    applyChatRecords(getGuestChatHistory());
    return;
  }
  try {
    const data = await getJson("/api/chat/history?limit=120", true);
    applyChatRecords(Array.isArray(data?.messages) ? data.messages : []);
  } catch {
    applyChatRecords([]);
  }
}

async function clearChatHistory() {
  if (!chatWindow) return;
  applyChatRecords([]);
  const token = getToken();
  if (token) {
    try {
      await postJson("/api/chat/history/clear", {}, true);
    } catch {
      // Keep UI responsive even if clear fails; history can be reloaded later.
    }
    return;
  }
  setGuestChatHistory([]);
}

if (profileForm) {
  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = getToken();
    const user = getStoredUser();
    if (!token || !user?.account) {
      setFormMessage(profileForm, "请先登录后再填写资料");
      return;
    }

    const profile = {
      name: profileForm.elements.name?.value.trim(),
      birth: profileForm.elements.birth?.value,
      gender: profileForm.elements.gender?.value,
      education: profileForm.elements.education?.value,
      phone: profileForm.elements.phone?.value.trim()
    };

    if (!profile.name || !profile.birth || !profile.gender || !profile.education || !profile.phone) {
      setFormMessage(profileForm, "请完整填写所有资料");
      return;
    }

    setFormMessage(profileForm, "");
    try {
      const data = await postJson("/api/profile", { profile }, true);
      profileCached = data.profile || profile;
      updateProfileDisplay({ ...(data.profile || profile), account: user.account });
      setFormMessage(profileForm, "资料已保存", "success");
    } catch (error) {
      setFormMessage(profileForm, error.message || "保存失败");
    }
  });
}

if (logoutLink) {
  logoutLink.addEventListener("click", () => {
    clearToken();
    clearStoredUser();
  });
}

function appendMessage({ role, text, title }) {
  if (!chatWindow) return null;
  const message = document.createElement("div");
  message.className = `message ${role}`;

  if (role === "bot") {
    message.innerHTML = `
      <div class="avatar">医</div>
      <div class="bubble">
        ${title ? `<div class="bubble-title"></div>` : ""}
        <div class="bubble-text"></div>
        <div class="bubble-meta">刚刚</div>
      </div>
    `;
  } else {
    message.innerHTML = `
      <div class="bubble">
        <div class="bubble-text"></div>
        <div class="bubble-meta">刚刚</div>
      </div>
    `;
  }

  const textEl = message.querySelector('.bubble-text');
  if (textEl) {
    if (role === 'bot') {
      textEl.innerHTML = renderMarkdown(text);
    } else {
      textEl.textContent = text || '';
    }
  }
  if (role === 'bot' && title) {
    const titleEl = message.querySelector('.bubble-title');
    if (titleEl) titleEl.textContent = title;
  }

  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return message;
}

async function sendMessage(text) {
  const content = String(text || '').trim();
  if (!content || !chatWindow) return;
  const historySnapshot = chatRecords.slice(-CHAT_CONTEXT_WINDOW);

  appendMessage({ role: 'user', text: content });
  appendChatRecord({ role: "user", content });
  chatInput.value = '';

  const botMessage = appendMessage({ role: 'bot', title: '医疗建议', text: '正在生成...' });

  try {
    const payload = buildChatPayload(content, historySnapshot);
    const response = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.error || '请求失败');
    }
    const answer = data.answer || '暂未获得回复，请稍后再试。';
    const title = data.escalate ? '风险提示' : '医疗建议';
    const riskLevel = String(data.risk_level || (data.escalate ? "sensitive" : "normal"));
    updateBotMessage(botMessage, { title, text: answer });
    appendChatRecord({ role: "assistant", content: answer, title, riskLevel });
  } catch (error) {
    const message = error.message || '请求失败';
    updateBotMessage(botMessage, { title: '系统提示', text: message });
    appendChatRecord({ role: "assistant", content: message, title: "系统提示", riskLevel: "system" });
  }
}

if (chatForm) {
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(chatInput.value);
  });
}

if (clearChatHistoryButton) {
  clearChatHistoryButton.addEventListener("click", () => {
    clearChatHistory();
  });
}

promptButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const prompt = button.dataset.prompt || "";
    chatInput.value = prompt;
    chatInput.focus();
  });
});

function setLearnView(viewId) {
  learnViews.forEach((view) => {
    view.classList.toggle("is-active", view.dataset.learnView === viewId);
  });
  learnTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.learn === viewId);
  });
}

learnTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const viewId = tab.dataset.learn;
    if (viewId) {
      setLearnView(viewId);
    }
  });
});

if (articleList) {
  const articleItems = articleList.querySelectorAll("details.article-item");
  const articleSections = articleList.querySelectorAll("details.article-section");

  articleItems.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      articleItems.forEach((other) => {
        if (other === item) return;
        other.open = false;
        other
          .querySelectorAll("details.article-section[open]")
          .forEach((section) => {
            section.open = false;
          });
      });
    });
  });

  articleSections.forEach((section) => {
    section.addEventListener("toggle", () => {
      if (!section.open) return;
      const parentItem = section.closest("details.article-item");
      if (!parentItem) return;
      parentItem
        .querySelectorAll("details.article-section")
        .forEach((other) => {
          if (other !== section) {
            other.open = false;
          }
        });
    });
  });
}

if (surveyForm) {
  surveyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const token = getToken();
    if (!token) {
      setFormMessage(surveyForm, "请先登录后再提交问卷");
      return;
    }

    const satisfaction = Number(
      surveyForm.querySelector('input[name="satisfaction"]:checked')?.value
    );
    const understanding = Number(
      surveyForm.querySelector('input[name="understanding"]:checked')?.value
    );
    const anxiety =
      surveyForm.querySelector('input[name="anxiety"]:checked')?.value || "";
    const helpful =
      surveyForm.querySelector('input[name="helpful"]:checked')?.value || "";
    const compliance = Array.from(
      surveyForm.querySelectorAll('input[name="compliance"]:checked')
    ).map((item) => item.value);
    const suggestion =
      surveyForm.querySelector('textarea[name="suggestion"]')?.value.trim() ||
      "";

    if (!satisfaction || !understanding || !anxiety || !helpful) {
      setFormMessage(surveyForm, "请完整填写必填项");
      return;
    }

    const payload = {
      satisfaction,
      understanding,
      anxiety,
      compliance,
      helpful,
      suggestion
    };

    setFormMessage(surveyForm, "");
    postJson("/api/survey", payload, true)
      .then((data) => {
        surveyCached = data?.survey || payload;
        updateSurveyCard(surveyCached);
        if (!surveyToast) return;
        surveyToast.textContent = "感谢反馈，已保存您的随访信息。";
        surveyToast.classList.add("is-visible");
        clearTimeout(surveyToastTimer);
        surveyToastTimer = setTimeout(() => {
          surveyToast.classList.remove("is-visible");
        }, 2400);
      })
      .catch((error) => {
        setFormMessage(surveyForm, error.message || "提交失败");
      });
  });
}

loadProfile();
loadSurveyStatus();
loadChatHistory();
