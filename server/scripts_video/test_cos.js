const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');
const path = require('path');

// 从 .env 文件加载环境变量
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0 && !line.startsWith('#')) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
});

const bucket = process.env.COS_BUCKET;
const region = process.env.COS_REGION || 'ap-guangzhou';

async function testCOS() {
  console.log('COS配置:');
  console.log('  Bucket:', bucket);
  console.log('  Region:', region);
  console.log('  SecretId:', process.env.COS_SECRET_ID);
  console.log('');

  // 测试获取桶信息
  console.log('测试获取桶信息...');
  cos.getBucket({
    Bucket: bucket,
    Region: region,
  }, (err, data) => {
    if (err) {
      console.error('❌ 获取桶信息失败:', err);
      console.error('错误代码:', err.code);
      console.error('错误消息:', err.message);
    } else {
      console.log('✅ 成功连接到COS桶');
      console.log('   文件数量:', data.Contents?.length || 0);
      console.log('   前缀:', data.Prefix);
      console.log('   标记:', data.Marker);
    }
  });
}

testCOS();
