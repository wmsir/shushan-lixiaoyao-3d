import os from 'node:os';
import { spawn } from 'node:child_process';

const port = process.env.PORT || '4188';
const nets = os.networkInterfaces();
const ips = [];
for (const name of Object.keys(nets)) {
  for (const net of nets[name] || []) {
    if (net.family === 'IPv4' && !net.internal) {
      ips.push(net.address);
    }
  }
}

console.log('\n======================================================');
console.log('  《仙剑 · 锁妖剑台》局域网联机/多设备访问已启动');
console.log(`  本机打开: http://127.0.0.1:${port}`);
for (const ip of ips) {
  console.log(`  同 Wi-Fi 其他电脑 / 手机打开: http://${ip}:${port}`);
}
console.log('======================================================\n');

const child = spawn('npx', ['vite', 'preview', '--host', '0.0.0.0', '--port', port], {
  stdio: 'inherit',
  shell: true,
});
child.on('exit', (code) => process.exit(code ?? 0));
