#!/usr/bin/env node
/**
 * One-command SCP deployment helper for publishing 《仙剑 · 锁妖剑台》 to fwpt.cn.
 *
 * Usage:
 *   node scripts/deploy-fwpt.mjs --host fwpt.cn --user root --path /var/www/fwpt.cn/lixiaoyao [--port 22] [--key ~/.ssh/id_ed25519] [--single]
 *
 * Or via environment variables:
 *   FWPT_HOST=fwpt.cn FWPT_USER=root FWPT_PATH=/var/www/fwpt.cn/lixiaoyao npm run deploy:fwpt
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {
    host: process.env.FWPT_HOST || 'fwpt.cn',
    user: process.env.FWPT_USER || '',
    remotePath: process.env.FWPT_PATH || '',
    port: process.env.FWPT_PORT || '22',
    key: process.env.FWPT_KEY || '',
    single: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--host') out.host = argv[++i];
    else if (a === '--user') out.user = argv[++i];
    else if (a === '--path') out.remotePath = argv[++i];
    else if (a === '--port') out.port = argv[++i];
    else if (a === '--key') out.key = argv[++i];
    else if (a === '--single') out.single = true;
  }
  return out;
}

const cfg = parseArgs(process.argv.slice(2));
if (!cfg.user || !cfg.remotePath) {
  console.error(
    'Missing required SSH target options.\n' +
      'Example:\n' +
      '  node scripts/deploy-fwpt.mjs --host fwpt.cn --user root --path /var/www/fwpt.cn/game\n' +
      'Add --single to upload only the self-contained single HTML file as index.html.',
  );
  process.exit(1);
}

const target = `${cfg.user}@${cfg.host}`;
const sshArgs = ['-p', String(cfg.port)];
const scpArgs = ['-P', String(cfg.port)];
if (cfg.key) {
  sshArgs.push('-i', cfg.key);
  scpArgs.push('-i', cfg.key);
}

console.log(`Ensuring remote directory ${cfg.remotePath} on ${target}...`);
execFileSync('ssh', [...sshArgs, target, `mkdir -p "${cfg.remotePath}"`], { stdio: 'inherit' });

if (cfg.single) {
  const singleFile = path.resolve('dist/li-xiaoyao-3d.html');
  if (!fs.existsSync(singleFile)) {
    throw new Error('dist/li-xiaoyao-3d.html not found. Run npm run build:single first.');
  }
  console.log(`Uploading single-file game to ${target}:${cfg.remotePath}/index.html ...`);
  execFileSync('scp', [...scpArgs, singleFile, `${target}:${cfg.remotePath}/index.html`], {
    stdio: 'inherit',
  });
} else {
  const distDir = path.resolve('dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('dist/index.html not found. Run npm run build first.');
  }
  console.log(`Uploading dist/ static bundle to ${target}:${cfg.remotePath}/ ...`);
  execFileSync('scp', [...scpArgs, '-r', path.join(distDir, 'index.html'), path.join(distDir, 'assets'), `${target}:${cfg.remotePath}/`], {
    stdio: 'inherit',
  });
}

console.log('Deployment complete! Open https://' + cfg.host + ' (or configured subpath) to play.');
