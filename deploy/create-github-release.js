const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const uiDir = path.join(__dirname, '..', 'orange-home-ui');
const packageJsonPath = path.join(uiDir, 'package.json');
const distDir = path.join(uiDir, 'dist', 'orange-home-ui', 'browser');
const deployDir = __dirname; // Папка deploy

function toPosixPath(winPath) {
  return winPath.replace(/\\/g, '/').replace(/^([A-Z]):/i, (match, drive) => `/${drive.toLowerCase()}`);
}

async function promptBumpType() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  return new Promise((resolve) => {
    rl.question(`\n📌 Текущая версия: ${currentVersion}\n   Какой тип обновления? (patch/minor/major) [patch]: `, (answer) => {
      rl.close();
      resolve(answer.trim() || 'patch');
    });
  });
}

async function main() {
  const bumpType = await promptBumpType();
  if (!['patch', 'minor', 'major'].includes(bumpType)) {
    console.error(`❌ Неверный тип обновления: ${bumpType}. Используйте patch/minor/major`);
    process.exit(1);
  }

  console.log(`\n🚀 Повышаем версию (${bumpType})...`);
  execSync(`npm version ${bumpType} --no-git-tag-version`, { cwd: uiDir, stdio: 'inherit' });

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  const tagName = `v${version}`;
  const archiveName = `orange-home-ui-${tagName}.tar.gz`;
  const archivePath = path.join(deployDir, archiveName);

  console.log(`\n📝 Фиксация изменений версии в Git...`);
  execSync(`git add package.json package-lock.json`, { cwd: uiDir, stdio: 'inherit' });
  execSync(`git commit -m "chore: release ${tagName}"`, { cwd: uiDir, stdio: 'inherit' });
  execSync(`git tag ${tagName}`, { cwd: uiDir, stdio: 'inherit' });

  console.log(`\n📦 Сборка проекта (генерация актуального version.json)...`);
  execSync(`npm run build:versioned`, { cwd: uiDir, stdio: 'inherit' });

  console.log(`\n🗜️ Упаковка актуальных файлов в ${archiveName}...`);
  const posixArchivePath = toPosixPath(archivePath);
  const posixDistDir = toPosixPath(distDir);
  execSync(`tar -czf "${posixArchivePath}" -C "${posixDistDir}" .`, { stdio: 'inherit' });

  console.log(`\n🏷️ Отправка коммита и тега на GitHub...`);
  const currentBranch = execSync('git branch --show-current', { cwd: uiDir }).toString().trim();
  execSync(`git push origin ${currentBranch}`, { cwd: uiDir, stdio: 'inherit' });
  execSync(`git push origin ${tagName}`, { cwd: uiDir, stdio: 'inherit' });

  console.log(`\n☁️ Создание релиза на GitHub...`);
  execSync(
    `gh release create "${tagName}" "${archivePath}" ` +
    `--title "Release ${tagName}" ` +
    `--target "${currentBranch}" ` +
    `--generate-notes`,
    { cwd: uiDir, stdio: 'inherit' }
  );

  // 🧹 ОЧИСТКА: удаляем текущий и все старые архивы релизов
  console.log('\n🧹 Очистка папки deploy от архивов релизов...');
  const files = fs.readdirSync(deployDir);
  let cleanedCount = 0;
  
  for (const file of files) {
    if (file.startsWith('orange-home-ui-v') && file.endsWith('.tar.gz')) {
      const filePath = path.join(deployDir, file);
      try {
        fs.unlinkSync(filePath);
        console.log(`   🗑️ Удален: ${file}`);
        cleanedCount++;
      } catch (err) {
        console.warn(`   ⚠️ Не удалось удалить ${file}:`, err.message);
      }
    }
  }
  
  if (cleanedCount === 0) {
    console.log('   ℹ️ Старых архивов не найдено.');
  }

  console.log(`\n🎉 Успешно! Релиз ${tagName} опубликован, мусор удален.`);
}

main().catch(err => {
  console.error('❌ Критическая ошибка:', err.message);
  process.exit(1);
});