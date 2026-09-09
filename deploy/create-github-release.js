const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const uiDir = path.join(__dirname, '..', 'orange-home-ui');
const packageJsonPath = path.join(uiDir, 'package.json');
const distDir = path.join(uiDir, 'dist', 'orange-home-ui', 'browser');

function toPosixPath(winPath) {
  return winPath.replace(/\\/g, '/').replace(/^([A-Z]):/i, (match, drive) => `/${drive.toLowerCase()}`);
}

// Интерактивный выбор типа обновления
async function promptBumpType() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`\n📌 Текущая версия: ${currentVersion}\n` +
                `   Какой тип обновления? (patch/minor/major) [patch]: `, (answer) => {
      rl.close();
      resolve(answer.trim() || 'patch');
    });
  });
}

async function main() {
  // 0. Спрашиваем тип обновления
  const bumpType = await promptBumpType();
  if (!['patch', 'minor', 'major'].includes(bumpType)) {
    console.error(`❌ Неверный тип обновления: ${bumpType}. Используйте patch/minor/major`);
    process.exit(1);
  }

  console.log(`\n🚀 Повышаем версию (${bumpType})...`);
  try {
    execSync(`npm version ${bumpType} --no-git-tag-version`, { cwd: uiDir, stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Ошибка при повышении версии');
    process.exit(1);
  }

  // 1. Читаем новую версию
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  const tagName = `v${version}`;
  const archiveName = `orange-home-ui-${tagName}.tar.gz`;
  const archivePath = path.join(__dirname, archiveName);

  console.log(`📦 Новая версия: ${tagName}`);

  // 2. Проверяем, что dist существует
  if (!fs.existsSync(distDir)) {
    console.error('❌ Ошибка: Папка dist/orange-home-ui/browser не найдена!');
    console.error('   Сначала выполните: npm run build:versioned');
    process.exit(1);
  }

  // 3. Создаем архив
  console.log(`🗜️  Упаковка файлов в ${archiveName}...`);
  try {
    const posixArchivePath = toPosixPath(archivePath);
    const posixDistDir = toPosixPath(distDir);
    execSync(`tar -czf "${posixArchivePath}" -C "${posixDistDir}" .`, { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Ошибка при создании архива:', error.message);
    process.exit(1);
  }

  // 4. Проверяем, что релиз с таким тегом не существует
  console.log(`🔍 Проверка существования релиза ${tagName}...`);
  try {
    execSync(`gh release view ${tagName}`, { cwd: uiDir, stdio: 'pipe' });
    console.error(`❌ Релиз ${tagName} уже существует!`);
    console.error('   Удалите его командой: gh release delete ' + tagName + ' --yes');
    fs.unlinkSync(archivePath);
    process.exit(1);
  } catch (e) {
    // Релиз не существует — это то, что нам нужно
  }

  // 5. Создаем релиз на GitHub
  console.log(`☁️  Создание релиза ${tagName} на GitHub...`);
  try {
    execSync(
      `gh release create "${tagName}" "${archivePath}" ` +
      `--title "Release ${tagName}" ` +
      `--generate-notes`,
      { cwd: uiDir, stdio: 'inherit' }
    );
  } catch (error) {
    console.error('❌ Ошибка при создании релиза через gh CLI');
    process.exit(1);
  }

  // 6. Создаем git-коммит и тег локально
  console.log(`📝 Создание git-коммита и тега...`);
  try {
    execSync(`git add package.json package-lock.json`, { cwd: uiDir, stdio: 'inherit' });
    execSync(`git commit -m "Release ${tagName}"`, { cwd: uiDir, stdio: 'inherit' });
    execSync(`git tag ${tagName}`, { cwd: uiDir, stdio: 'inherit' });
  } catch (error) {
    console.warn('⚠️ Не удалось создать git-коммит/тег (возможно, нет изменений)');
  }

  // 7. Очищаем временный архив
  console.log('🧹 Очистка временных файлов...');
  fs.unlinkSync(archivePath);

  console.log(`\n🎉 Успешно! Релиз ${tagName} опубликован.`);
  console.log(`   Orange Pi автоматически заберет эту версию при следующем запуске cron.`);
}

main();