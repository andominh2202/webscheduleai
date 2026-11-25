import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl =
  process.env.CAPACITOR_SERVER_URL || 'https://webscheduleai.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.webschedule.app',
  appName: 'WebSchedule',
  webDir: 'mobile-www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f8fafc',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#f8fafc',
  },
};

export default config;
