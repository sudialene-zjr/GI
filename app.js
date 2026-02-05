const viewButtons = document.querySelectorAll("[data-view]");
const views = document.querySelectorAll(".view");
const navLinks = document.querySelectorAll(".nav-link");

const authTabs = document.querySelectorAll("[data-auth]");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-text");
const chatWindow = document.getElementById("chat-window");
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

let surveyToastTimer;

const botReplies = [
  "术前建议禁食8小时、禁饮2小时。如为上午9点检查，建议前一晚23点后停止进食，早上7点后停止饮水。",
  "术后2-3小时可少量饮水，如无不适可进清淡流质，避免辛辣油腻。",
  "若出现持续腹痛、黑便或发热，请及时联系就医或就诊。",
  "肠镜前泻药按医嘱分次服用，排出物清亮为佳。"
];

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
        if (profileForm.elements.name) profileForm.elements.name.value = profile.name || user.name || "";
        if (profileForm.elements.birth) profileForm.elements.birth.value = profile.birth || "";
        if (profileForm.elements.gender) profileForm.elements.gender.value = profile.gender || "";
        if (profileForm.elements.education) profileForm.elements.education.value = profile.education || "";
        if (profileForm.elements.phone) profileForm.elements.phone.value = profile.phone || "";
        updateProfileDisplay({ ...profile, account: user.account });
      } else {
        updateProfileDisplay({ name: user.name || "", account: user.account });
      }
    } catch {
      updateProfileDisplay({ name: user.name || "", account: user.account });
    }
  } catch (error) {
    clearToken();
    clearStoredUser();
    if (profileGuestEl) profileGuestEl.classList.remove("is-hidden");
    if (profileContentEl) profileContentEl.classList.add("is-hidden");
    updateProfileDisplay({});
  }
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
  const message = document.createElement("div");
  message.className = `message ${role}`;

  if (role === "bot") {
    message.innerHTML = `
      <div class="avatar">医</div>
      <div class="bubble">
        ${title ? `<div class="bubble-title">${title}</div>` : ""}
        <div class="bubble-text">${text}</div>
        <div class="bubble-meta">刚刚</div>
      </div>
    `;
  } else {
    message.innerHTML = `
      <div class="bubble">
        <div class="bubble-text">${text}</div>
        <div class="bubble-meta">刚刚</div>
      </div>
    `;
  }

  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function sendMessage(text) {
  if (!text.trim()) return;
  appendMessage({ role: "user", text });
  chatInput.value = "";

  const reply = botReplies[Math.floor(Math.random() * botReplies.length)];
  setTimeout(() => {
    appendMessage({ role: "bot", title: "护理建议", text: reply });
  }, 600);
}

if (chatForm) {
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(chatInput.value);
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
    if (!surveyToast) return;
    surveyToast.classList.add("is-visible");
    clearTimeout(surveyToastTimer);
    surveyToastTimer = setTimeout(() => {
      surveyToast.classList.remove("is-visible");
    }, 2400);
  });
}

loadProfile();
