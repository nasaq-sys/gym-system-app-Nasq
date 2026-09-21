export interface CapacitorConfig {
  appId?: string;
  appName?: string;
  webDir?: string;
  server?: {
    androidScheme?: string;
    iosScheme?: string;
    url?: string;
    cleartext?: boolean;
  };
  plugins?: Record<string, unknown>;
}

const config: CapacitorConfig = {
  appId: "com.ultragym.app",
  appName: "Nasaq Gym",
  webDir: "public",
  server: {
    androidScheme: "https",
    iosScheme: "nasaqgym",
  },
  plugins: {
    WorkoutRestTimerPlugin: {
      appGroup: "group.com.ultragym.app",
      notificationChannelName: "Workout Rest Timer",
      notificationChannelDescription: "Displays the active workout rest countdown",
    },
  },
};

export default config;
