import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const versionTsPath = path.join(root, 'src/version.ts');
const pkgPath = path.join(root, 'package.json');
const gradlePath = path.join(root, 'android/app/build.gradle');
const pbxPath = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');

const verTs = fs.readFileSync(versionTsPath, 'utf8');
const match = verTs.match(/APP_VERSION\s*=\s*'(\d+\.\d+)'/);
if (!match) {
  throw new Error('Could not parse APP_VERSION from src/version.ts');
}

const currentInt = Math.round(Number.parseFloat(match[1]) * 100);
const nextInt = currentInt + 1;
const nextVersion = (nextInt / 100).toFixed(2);

fs.writeFileSync(
  versionTsPath,
  `export const APP_VERSION = '${nextVersion}';\nexport const APP_VERSION_CODE = ${nextInt};\n`,
  'utf8',
);

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = `${nextVersion}.0`;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

let gradle = fs.readFileSync(gradlePath, 'utf8');
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${nextInt}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${nextVersion}"`);
fs.writeFileSync(gradlePath, gradle, 'utf8');

let pbx = fs.readFileSync(pbxPath, 'utf8');
pbx = pbx
  .replace(/CURRENT_PROJECT_VERSION\s*=\s*\d+;/g, `CURRENT_PROJECT_VERSION = ${nextInt};`)
  .replace(/MARKETING_VERSION\s*=\s*[^;]+;/g, `MARKETING_VERSION = ${nextVersion};`);
fs.writeFileSync(pbxPath, pbx, 'utf8');

console.log(`Version bumped: ${match[1]} -> ${nextVersion} (code ${nextInt})`);
