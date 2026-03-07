# GI Education Assistant - Admin Panel

## 启动管理员端

```bash
cd server/admin
npm install
npm start
```

管理员端将在 http://localhost:3300 启动

## 功能

- 数据概览：显示满意度、理解度、焦虑程度的统计数据和图表
- 调查详情：查看所有用户的满意度问卷调查记录

## API 端点

- `POST /api/admin/login` - 管理员登录
- `GET /api/admin/survey-stats` - 获取统计数据
- `GET /api/admin/surveys?page=1&pageSize=20` - 获取调查列表（分页）
