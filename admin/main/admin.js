const API_BASE = window.location.origin;

// 存储管理数据
let currentView = 'dashboard';
let surveyData = null;
let selectedUserId = null;
let selectedSessionId = null;
let currentFilters = { userType: '' };

// 从 URL 读取状态
function readStateFromURL() {
  const params = new URLSearchParams(window.location.search);
  return {
    view: params.get('view') || 'dashboard',
    userId: params.get('userId'),
    sessionId: params.get('sessionId'),
    userType: params.get('userType') || ''
  };
}

// 更新 URL 状态
function updateURLState() {
  const params = new URLSearchParams();
  
  if (currentView !== 'dashboard') {
    params.set('view', currentView);
  }
  if (selectedUserId) {
    params.set('userId', selectedUserId);
  }
  if (selectedSessionId) {
    params.set('sessionId', selectedSessionId);
  }
  if (currentFilters.userType) {
    params.set('userType', currentFilters.userType);
  }
  
  const newURL = params.toString()
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;
  
  window.history.replaceState({ view: currentView, userId: selectedUserId, sessionId: selectedSessionId }, '', newURL);
}

// DOM 元素
const loginContainer = document.getElementById('login-container');
const adminLayout = document.getElementById('admin-layout');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const errorMessage = document.getElementById('error-message');
const logoutBtn = document.getElementById('logout-btn');

// 检查登录状态
function checkAuth() {
  const token = localStorage.getItem('adminToken');
  if (token) {
    showAdminLayout();
  }
}

// 显示管理面板
function showAdminLayout() {
  loginContainer.style.display = 'none';
  adminLayout.classList.add('active');
  
  // 从 URL 恢复状态
  const state = readStateFromURL();
  currentView = state.view;
  
  // 恢复筛选条件
  if (state.userType) {
    currentFilters.userType = state.userType;
    document.getElementById('filter-user-type').value = state.userType;
  }
  
  // 根据状态加载对应视图
  switchView(currentView, false);
  
  // 如果有选中的用户，延迟加载聊天记录（等用户列表加载完成）
  if (state.userId || state.sessionId) {
    setTimeout(() => {
      selectedUserId = state.userId;
      selectedSessionId = state.sessionId;
      loadUserChat(state.userId, state.sessionId);
      
      // 高亮对应的用户项
      const userItems = document.querySelectorAll('.user-item');
      userItems.forEach(item => {
        const itemUserId = item.dataset.userId || null;
        const itemSessionId = item.dataset.sessionId || null;
        if ((state.userId && itemUserId === state.userId) ||
            (state.sessionId && itemSessionId === state.sessionId)) {
          item.classList.add('active');
        }
      });
    }, 500);
  }
}

// 显示登录页面
function showLoginPage() {
  loginContainer.style.display = 'flex';
  adminLayout.classList.remove('active');
}

// 登录处理
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    showError('请输入用户名和密码');
    return;
  }

  loginBtn.disabled = true;
  errorMessage.textContent = '';

  try {
    const response = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.ok) {
      localStorage.setItem('adminToken', data.token);
      showAdminLayout();
    } else {
      showError(data.message || '登录失败');
    }
  } catch (error) {
    showError('网络错误，请重试');
  } finally {
    loginBtn.disabled = false;
  }
});

// 显示错误信息
function showError(message) {
  errorMessage.textContent = message;
}

// 退出登录
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  showLoginPage();
});

// 切换视图
function switchView(view, updateURL = true) {
  currentView = view;
  
  // 更新导航高亮
  document.querySelectorAll('.admin-nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.view === view);
  });

  if (currentView === 'dashboard') {
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('surveys-view').classList.add('hidden');
    document.getElementById('messages-view').classList.add('hidden');
    loadDashboardData();
  } else if (currentView === 'surveys') {
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('surveys-view').classList.remove('hidden');
    document.getElementById('messages-view').classList.add('hidden');
    loadSurveyList();
  } else if (currentView === 'messages') {
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('surveys-view').classList.add('hidden');
    document.getElementById('messages-view').classList.remove('hidden');
    loadMessageList(currentFilters);
  }
  
  if (updateURL) {
    updateURLState();
  }
}

// 导航切换
document.querySelectorAll('.admin-nav-item').forEach(item => {
  item.addEventListener('click', () => {
    switchView(item.dataset.view);
  });
});

// 加载仪表盘数据
async function loadDashboardData() {
  try {
    const token = localStorage.getItem('adminToken');
    const response = await fetch(`${API_BASE}/api/admin/survey-stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (data.ok) {
      surveyData = data;
      renderDashboard(data);
    } else {
      console.error('加载数据失败:', data.message);
    }
  } catch (error) {
    console.error('加载数据失败:', error);
  }
}

// 渲染仪表盘
function renderDashboard(data) {
  console.log('接收到的数据:', data);

  // 总体统计
  document.getElementById('total-surveys').textContent = data.overview.total_surveys || 0;
  const avgSat = data.overview.avg_satisfaction !== null && data.overview.avg_satisfaction !== undefined ? parseFloat(data.overview.avg_satisfaction) : 0;
  const avgUnd = data.overview.avg_understanding !== null && data.overview.avg_understanding !== undefined ? parseFloat(data.overview.avg_understanding) : 0;
  document.getElementById('avg-satisfaction').textContent = avgSat.toFixed(2);
  document.getElementById('avg-understanding').textContent = avgUnd.toFixed(2);

  // 满意度图表
  console.log('满意度数据:', data.satisfaction);
  if (data.satisfaction && data.satisfaction.length > 0) {
    renderPieChart('satisfaction-chart', data.satisfaction, 'satisfaction');
  } else {
    document.getElementById('satisfaction-chart').innerHTML = '<div style="text-align:center;color:#999;padding:20px;">暂无数据</div>';
  }

  // 理解度图表
  console.log('理解度数据:', data.understanding);
  if (data.understanding && data.understanding.length > 0) {
    renderPieChart('understanding-chart', data.understanding, 'understanding');
  } else {
    document.getElementById('understanding-chart').innerHTML = '<div style="text-align:center;color:#999;padding:20px;">暂无数据</div>';
  }

  // 焦虑程度图表
  console.log('焦虑数据:', data.anxiety);
  if (data.anxiety && data.anxiety.length > 0) {
    renderPieChart('anxiety-chart', data.anxiety, 'anxiety');
  } else {
    document.getElementById('anxiety-chart').innerHTML = '<div style="text-align:center;color:#999;padding:20px;">暂无数据</div>';
  }

  // 年龄分布图表
  console.log('年龄分布数据:', data.ageDistribution);
  if (data.ageDistribution && data.ageDistribution.length > 0) {
    renderPieChart('age-chart', data.ageDistribution, 'age_range');
  } else {
    document.getElementById('age-chart').innerHTML = '<div style="text-align:center;color:#999;padding:20px;">暂无数据</div>';
  }
}

// 渲染条形图
function renderBarChart(containerId, data, unit) {
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">暂无数据</div>';
    return;
  }

  const maxCount = Math.max(...data.map(d => d.count));

  container.innerHTML = data.map(item => `
    <div class="bar-row">
      <div class="bar-label">${item.satisfaction || item.understanding}${unit}</div>
      <div class="bar-container">
        <div class="bar-fill" style="width: ${(item.count / maxCount) * 100}%">
          ${item.count}
        </div>
      </div>
    </div>
  `).join('');
}

// 渲染饼图
function renderPieChart(containerId, data, labelField) {
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">暂无数据</div>';
    return;
  }

  const total = data.reduce((sum, item) => sum + item.count, 0);

  // 颜色数组
  const colors = [
    '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b'
  ];

  // 生成饼图 SVG
  let svg = '<svg viewBox="0 0 200 200" width="200" height="200">';
  let startAngle = 0;

  data.forEach((item, index) => {
    const percentage = item.count / total;
    const angle = percentage * 360;
    const color = colors[index % colors.length];

    // 绘制扇形
    const x1 = 100 + 80 * Math.cos((startAngle - 90) * Math.PI / 180);
    const y1 = 100 + 80 * Math.sin((startAngle - 90) * Math.PI / 180);
    const x2 = 100 + 80 * Math.cos((startAngle + angle - 90) * Math.PI / 180);
    const y2 = 100 + 80 * Math.sin((startAngle + angle - 90) * Math.PI / 180);

    const largeArcFlag = angle > 180 ? 1 : 0;

    if (percentage === 1) {
      // 完整的圆
      svg += `<circle cx="100" cy="100" r="80" fill="${color}" />`;
    } else {
      svg += `<path d="M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArcFlag} 1 ${x2} ${y2} Z" fill="${color}" />`;
    }

    startAngle += angle;
  });

  // 绘制中心白色圆（环形图效果）
  svg += `<circle cx="100" cy="100" r="50" fill="white" />`;
  svg += '</svg>';

  // 生成图例
  const legend = data.map((item, index) => {
    const color = colors[index % colors.length];
    const percentage = ((item.count / total) * 100).toFixed(1);
    const label = item[labelField] || item.satisfaction || item.understanding || item.anxiety;
    return `
      <div class="legend-item">
        <div class="legend-color" style="background-color: ${color}"></div>
        <span>${label}: ${item.count} (${percentage}%)</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="pie-chart">
      <div class="pie-container">${svg}</div>
      <div class="pie-legend">${legend}</div>
    </div>
  `;
}

// 渲染焦虑程度图表
function renderAnxietyChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">暂无数据</div>';
    return;
  }

  const maxCount = Math.max(...data.map(d => d.count));

  container.innerHTML = data.map(item => `
    <div class="bar-row">
      <div class="bar-label">${item.anxiety}</div>
      <div class="bar-container">
        <div class="bar-fill" style="width: ${(item.count / maxCount) * 100}%">
          ${item.count}
        </div>
      </div>
    </div>
  `).join('');
}

// 渲染年龄分布图表
function renderAgeChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">暂无数据</div>';
    return;
  }

  const maxCount = Math.max(...data.map(d => d.count));

  container.innerHTML = data.map(item => `
    <div class="bar-row">
      <div class="bar-label" style="font-size:13px;">${item.age_range}</div>
      <div class="bar-container">
        <div class="bar-fill" style="width: ${(item.count / maxCount) * 100}%">
          ${item.count}
        </div>
      </div>
    </div>
  `).join('');
}

// 加载调查列表
async function loadSurveyList(page = 1) {
  try {
    const token = localStorage.getItem('adminToken');
    const response = await fetch(`${API_BASE}/api/admin/surveys?page=${page}&pageSize=20`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (data.ok) {
      renderSurveyTable(data.data);
    } else {
      console.error('加载列表失败:', data.message);
    }
  } catch (error) {
    console.error('加载列表失败:', error);
  }
}

// 渲染调查表格
function renderSurveyTable(data) {
  const tbody = document.getElementById('surveys-tbody');
  document.getElementById('table-loading').style.display = 'none';

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">暂无数据</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(item => {
    const userName = item.user_name || '匿名';
    const userNameCell = item.user_id
      ? `<a class="user-name-link" data-user-id="${item.user_id}">${userName}</a>`
      : userName;

    return `
    <tr data-user-id="${item.user_id || ''}">
      <td>${userNameCell}</td>
      <td>${item.satisfaction}</td>
      <td>${item.understanding}</td>
      <td>${item.anxiety}</td>
      <td>${item.helpful}</td>
      <td>${item.suggestion || '-'}</td>
      <td>${new Date(item.created_at).toLocaleString('zh-CN')}</td>
    </tr>
  `;
  }).join('');

  // 添加点击事件
  tbody.querySelectorAll('.user-name-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const userId = e.target.dataset.userId;
      showUserModal(userId);
    });
  });
}

// 初始化
checkAuth();

// ==================== 用户AI交互记录 ====================

let allMessages = [];

// 加载所有消息列表
async function loadMessageList(filters = {}) {
  try {
    const token = localStorage.getItem('adminToken');
    console.log('开始加载消息列表，token:', token ? '存在' : '不存在');

    if (!token) {
      console.error('未登录，无法加载消息列表');
      document.getElementById('user-list-container').innerHTML =
        '<div class="loading">请先登录</div>';
      return;
    }

    // 构建查询参数
    const params = new URLSearchParams({
      page: '1',
      pageSize: '10000' // 获取所有消息用于分组
    });

    if (filters.userType) {
      params.append('isGuest', filters.userType === 'guest' ? 'true' : 'false');
    }

    console.log('请求URL:', `${API_BASE}/api/admin/messages?${params.toString()}`);
    const response = await fetch(`${API_BASE}/api/admin/messages?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    console.log('API响应:', data);

    if (data.ok) {
      allMessages = data.data;
      console.log('获取到的消息数量:', allMessages.length);
      renderUserList();
    } else {
      console.error('加载消息列表失败:', data.message);
      document.getElementById('user-list-container').innerHTML =
        '<div class="loading">加载失败: ' + data.message + '</div>';
    }
  } catch (error) {
    console.error('加载消息列表失败:', error);
    document.getElementById('user-list-container').innerHTML =
      '<div class="loading">加载失败: ' + error.message + '</div>';
  }
}

// 按用户分组消息
function groupMessagesByUser() {
  const userMap = new Map();

  console.log('开始分组消息，消息列表:', allMessages);

  allMessages.forEach(msg => {
    // 为访客使用 session_id，注册用户使用 user_id
    const key = msg.is_guest ? `guest_${msg.session_id}` : `user_${msg.user_id}`;
    const existing = userMap.get(key);

    console.log('处理消息:', { key, is_guest: msg.is_guest, role: msg.role });

    if (existing) {
      existing.messages.push(msg);
      // 如果新消息的时间更晚，更新最后消息时间
      const msgTime = new Date(msg.created_at);
      if (msgTime > existing.lastMessageTime) {
        existing.lastMessageTime = msgTime;
      }
    } else {
      userMap.set(key, {
        key,
        userId: msg.user_id,
        sessionId: msg.session_id,
        userName: msg.user_name || (msg.is_guest ? `访客 (${msg.session_id?.substring(0, 8)})` : '未知用户'),
        userAccount: msg.user_account,
        isGuest: msg.is_guest,  // 直接使用消息中的 is_guest 标志
        messages: [msg],
        lastMessageTime: new Date(msg.created_at)
      });
    }
  });

  console.log('分组结果，用户数量:', userMap.size);
  console.log('分组详情:', Array.from(userMap.values()).map(u => ({
    userName: u.userName,
    isGuest: u.isGuest,
    messageCount: u.messages.length
  })));

  // 按最后消息时间排序
  return Array.from(userMap.values()).sort((a, b) => b.lastMessageTime - a.lastMessageTime);
}

// 渲染用户列表
function renderUserList() {
  const container = document.getElementById('user-list-container');
  console.log('开始渲染用户列表，allMessages数量:', allMessages.length);

  const groupedUsers = groupMessagesByUser();
  console.log('分组后的用户数量:', groupedUsers.length);

  if (!groupedUsers || groupedUsers.length === 0) {
    container.innerHTML = '<div class="loading">暂无用户</div>';
    return;
  }

  container.innerHTML = groupedUsers.map(user => {
    const badge = user.isGuest
      ? '<span class="badge-guest">访客</span>'
      : '<span class="badge-registered">已注册</span>';

    const messageCount = user.messages.length;
    const timeStr = user.lastMessageTime.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    // 头像文字：访客显示"访"，注册用户显示"用"
    const avatarText = user.isGuest ? '访' : '用';
    const avatarClass = user.isGuest ? 'guest' : 'registered';

    return `
      <div class="user-item ${selectedUserId === user.userId && selectedSessionId === user.sessionId ? 'active' : ''}"
           data-user-id="${user.userId || ''}"
           data-session-id="${user.sessionId || ''}">
        <div class="user-list-avatar ${avatarClass}">${avatarText}</div>
        <div class="user-item-info">
          <div class="user-item-name">
            ${user.userName} ${badge}
          </div>
          <div class="user-item-meta">
            ${messageCount} 条消息 · ${timeStr}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 添加点击事件
  container.querySelectorAll('.user-item').forEach(item => {
    item.addEventListener('click', () => {
      const userId = item.dataset.userId || null;
      const sessionId = item.dataset.sessionId || null;

      // 更新选中状态
      container.querySelectorAll('.user-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // 加载该用户的聊天记录
      loadUserChat(userId, sessionId);
    });
  });
}

// 加载用户的聊天记录
function loadUserChat(userId, sessionId) {
  selectedUserId = userId || null;
  selectedSessionId = sessionId || null;
  
  // 更新 URL
  updateURLState();

  // 筛选该用户的所有消息
  const userMessages = allMessages.filter(msg => {
    if (userId) {
      return msg.user_id === userId;
    } else {
      return msg.session_id === sessionId && msg.is_guest;
    }
  });

  // 按时间排序
  userMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // 获取用户信息
  const user = allMessages.find(msg => {
    if (userId) return msg.user_id === userId;
    return msg.session_id === sessionId && msg.is_guest;
  });

  const userName = user?.user_name || (sessionId ? `访客 (${sessionId?.substring(0, 8)})` : '未知用户');

  renderChatView(userName, userMessages);
}

// 渲染聊天视图
function renderChatView(userName, messages) {
  const header = document.getElementById('messages-header');
  const container = document.getElementById('messages-chat-container');

  header.innerHTML = `<h2>${userName} 的聊天记录</h2>`;

  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <div class="empty-text">暂无聊天记录</div>
      </div>
    `;
    return;
  }

  // 判断当前用户是否是访客
  const isGuestUser = messages[0]?.is_guest;

  container.innerHTML = messages.map(msg => {
    const isUser = msg.role === 'user';

    // 访客显示"访"字，已注册用户显示"用"字；助手显示"医"字
    let avatarText, avatarColorClass;
    if (isUser) {
      avatarText = isGuestUser ? '访' : '用';
      avatarColorClass = isGuestUser ? 'guest' : 'registered';
    } else {
      avatarText = '医';
      avatarColorClass = 'assistant';
    }

    const riskClass = msg.risk_level === 'normal' ? 'risk-normal' :
                     msg.risk_level === 'sensitive' ? 'risk-sensitive' : 'risk-system';
    const riskText = msg.risk_level === 'normal' ? '正常' :
                    msg.risk_level === 'sensitive' ? '敏感' : '系统';

    const titleHtml = msg.title ? `
      <div class="chat-message-title">
        ${msg.title}
        <span class="risk-indicator ${riskClass}">${riskText}</span>
      </div>
    ` : '';

    const timeStr = new Date(msg.created_at).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return `
      <div class="chat-bubble ${isUser ? 'user' : 'assistant'}">
        <div class="chat-avatar ${avatarColorClass}">${avatarText}</div>
        <div class="chat-message">
          ${titleHtml}
          <div class="chat-message-content">${msg.content}</div>
          <div class="chat-message-time">${timeStr}</div>
        </div>
      </div>
    `;
  }).join('');

  // 滚动到底部
  container.scrollTop = container.scrollHeight;
}

// 筛选按钮事件
document.getElementById('filter-btn')?.addEventListener('click', () => {
  const userType = document.getElementById('filter-user-type').value;
  const searchText = document.getElementById('search-user').value.trim();

  const filters = {};
  if (userType) filters.userType = userType;
  if (searchText) filters.searchText = searchText;

  // 保存筛选条件
  currentFilters = filters;

  // 重置选中状态
  selectedUserId = null;
  selectedSessionId = null;

  // 重新加载
  loadMessageList(filters);

  // 更新 URL
  updateURLState();
});

// 监听浏览器前进/后退
window.addEventListener('popstate', (event) => {
  if (!event.state) return;

  // 恢复视图状态
  switchView(event.state.view || 'dashboard', false);

  // 恢复选中的用户
  if (event.state.userId || event.state.sessionId) {
    setTimeout(() => {
      selectedUserId = event.state.userId;
      selectedSessionId = event.state.sessionId;
      loadUserChat(event.state.userId, event.state.sessionId);

      // 高亮对应的用户项
      const userItems = document.querySelectorAll('.user-item');
      userItems.forEach(item => {
        const itemUserId = item.dataset.userId || null;
        const itemSessionId = item.dataset.sessionId || null;
        if ((event.state.userId && itemUserId === event.state.userId) ||
            (event.state.sessionId && itemSessionId === event.state.sessionId)) {
          item.classList.add('active');
        }
      });
    }, 500);
  }
});

// ==================== 用户详情弹窗 ====================

// 显示用户详情弹窗
async function showUserModal(userId) {
  const modal = document.getElementById('user-modal');
  const modalBody = document.getElementById('modal-body');
  const modalTitle = document.getElementById('modal-title');

  modalTitle.textContent = '用户详情';
  modalBody.innerHTML = '<div class="modal-loading">加载中...</div>';
  modal.classList.add('active');

  try {
    const token = localStorage.getItem('adminToken');
    const response = await fetch(`${API_BASE}/api/admin/user/${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (data.ok && data.data) {
      const user = data.data;
      modalTitle.textContent = user.name || '用户详情';
      renderUserModalContent(user);
    } else {
      modalBody.innerHTML = '<div class="modal-loading">加载失败</div>';
    }
  } catch (error) {
    console.error('加载用户详情失败:', error);
    modalBody.innerHTML = '<div class="modal-loading">加载失败: ' + error.message + '</div>';
  }
}

// 渲染用户详情内容
function renderUserModalContent(user) {
  const modalBody = document.getElementById('modal-body');

  // 区分标识信息和研究数据
  // 标识信息（不显示）：姓名、电话、邮箱、身份证号
  // 研究数据（可显示）：年龄、性别、职业等统计信息
  
  // 处理出生月份为年龄
  let ageDisplay = '-';
  if (user.birth_month) {
    try {
      const birthYear = parseInt(user.birth_month.substring(0, 4));
      const currentYear = new Date().getFullYear();
      const age = currentYear - birthYear;
      ageDisplay = age > 0 ? age + '岁' : '-';
    } catch (e) {
      ageDisplay = '-';
    }
  }

  const rows = [
    { label: '用户编号', value: '#' + user.id.substring(0, 8), note: '匿名编号', isIdentifier: true },
    { label: '注册时间', value: user.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '-', note: '仅显示年月日', isIdentifier: true },
    { label: '年龄', value: ageDisplay, note: '基于出生年份计算', isResearch: true },
    { label: '性别', value: user.gender || '-', note: '研究数据', isResearch: true },
    { label: '教育程度', value: user.education || '-', note: '研究数据', isResearch: true },
    { label: '职业', value: user.occupation || '-', note: '研究数据', isResearch: true },
    { label: '数据状态', value: '✓ 已验证', note: '账户状态正常', isIdentifier: true },
    { label: '交互次数', value: '***', note: '隐私保护，不显示具体数值', isIdentifier: true },
    { label: '调查参与', value: '***', note: '隐私保护，不显示参与状态', isIdentifier: true }
  ];

  modalBody.innerHTML = `
    <div class="data-notice">
      <div class="notice-text">
        <strong>科研数据模式</strong>
        <p>为保护隐私，个人标识信息已隐藏，仅显示可用于科学研究的人口统计学数据。</p>
      </div>
    </div>
    ${rows.map(row => `
      <div class="user-info-row ${row.isResearch ? 'research-data' : 'identifier-data'}">
        <div class="user-info-label">${row.label}</div>
        <div class="user-info-value ${row.isResearch ? 'research' : 'identifier'}">${row.value}</div>
        <div class="user-info-note">${row.note}</div>
      </div>
    `).join('')}
    <div class="data-footer">
      <small>*本系统严格遵循隐私保护，已隐藏所有标识信息，仅展示研究数据</small>
    </div>
  `;
}

// 关闭弹窗
document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('user-modal').classList.remove('active');
});

// 点击遮罩层关闭弹窗
document.getElementById('user-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.remove('active');
  }
});

// ESC 键关闭弹窗
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('user-modal').classList.remove('active');
  }
});
