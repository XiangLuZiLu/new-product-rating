const fs = require('fs');
const path = require('path');

const keys = [
  'ADMIN_PATH',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'SESSION_SECRET',
  'SESSION_IDLE_MINUTES',
  'STORAGE_DRIVER',
  'EDGEKV_NAMESPACE',
  'ALIYUN_EDGEKV_NAMESPACE',
  'KV_NAMESPACE',
  'KV_PREFIX'
];

const env = {};
for (const key of keys) {
  if (process.env[key] !== undefined && process.env[key] !== '') {
    env[key] = process.env[key];
  }
}

const outDir = path.join(__dirname, 'aliyun');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'env.generated.js');
const content = `// This file is generated during Alibaba Cloud ESA Pages build.\n// Do not put secrets in Git; the build script writes deployment variables here.\nexport default ${JSON.stringify(env, null, 2)};\n`;
fs.writeFileSync(outFile, content, 'utf8');
console.log(`Generated aliyun/env.generated.js with ${Object.keys(env).length} keys: ${Object.keys(env).join(', ') || '(none)'}`);
