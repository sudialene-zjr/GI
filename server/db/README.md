# DB 常用查询

以下命令均可在 `psql` 中执行（或通过 `-c` 参数执行）。

## 用户信息
```sql
SELECT id, name, account, created_at
FROM users
ORDER BY created_at DESC;
```

检查账号是否重复：
```sql
SELECT account, COUNT(*)
FROM users
GROUP BY account
HAVING COUNT(*) > 1;
```

## 用户资料（含电话）
```sql
SELECT u.id, u.name, u.account, p.birth_month, p.gender, p.education, p.phone, p.updated_at
FROM users u
LEFT JOIN user_profiles p ON p.user_id = u.id
ORDER BY p.updated_at DESC NULLS LAST;
```

## 问卷记录
```sql
SELECT id, user_id, satisfaction, understanding, anxiety, helpful, compliance, suggestion, created_at
FROM survey_responses
ORDER BY created_at DESC;
```

## 问卷 + 用户账号
```sql
SELECT u.account, u.name, s.satisfaction, s.understanding, s.anxiety, s.helpful, s.compliance, s.suggestion, s.created_at
FROM survey_responses s
LEFT JOIN users u ON u.id = s.user_id
ORDER BY s.created_at DESC;
```

# 数据库更改建议
如果有增删改表的需求，先在服务器调用导出脚本备份数据库
在更改了数据库的表格之后，记得更新导出/导入脚本以适配最新的数据库结构。