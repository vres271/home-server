const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const uiDir = path.join(__dirname, '..', 'orange-home-ui');
const packageJsonPath = path.join(uiDir, 'package.json');

// В Angular 17+ статические файлы по умолчанию берутся из папки public
const publicDir = path.join(uiDir, 'public');
const outputPath = path.join(publicDir, 'version.json');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

let commitHash = 'unknown';
try {
  commitHash = execSync('git rev-parse --short HEAD', { cwd: uiDir }).toString().trim();
} catch (e) {
  console.warn('⚠️ Не удалось получить хэш коммита');
}

const versionInfo = {
  version: version,
  commitHash: commitHash,
  buildDate: new Date().toISOString(),
  buildTimestamp: Date.now()
};

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(versionInfo, null, 2));

console.log(`✅ version.json успешно создан: ${outputPath}`);
console.log(`   📦 Версия: ${versionInfo.version}`);
console.log(`   🔗 Коммит: ${versionInfo.commitHash}`);
console.log(`   📅 Дата сборки: ${new Date(versionInfo.buildDate).toLocaleString('ru-RU')}`);