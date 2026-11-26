import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cn.fwpt.lixiaoyao',
  appName: '仙剑·锁妖剑台',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
    },
  },
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    preferredContentMode: 'mobile',
  },
};

export default config;
