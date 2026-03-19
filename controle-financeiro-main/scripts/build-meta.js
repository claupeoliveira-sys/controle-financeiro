const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const outputPath = path.join(rootDir, 'build-info.json');

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const now = new Date();

const buildInfo = {
  appName: pkg.name || 'controle-financeiro',
  appVersion: pkg.version || '0.0.0',
  buildTimestampISO: now.toISOString(),
  buildTimestampEpochMs: now.getTime()
};

fs.writeFileSync(outputPath, `${JSON.stringify(buildInfo, null, 2)}\n`, 'utf8');
console.log(`Build metadata atualizado em ${outputPath}`);

