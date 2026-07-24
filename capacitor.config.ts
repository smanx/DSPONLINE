import type { CapacitorConfig } from "@capacitor/cli";

const packageVersion = process.env.npm_package_version || "1.0.0";
const androidDebug = process.env.DSP_ANDROID_DEBUG === "1";

const config: CapacitorConfig = {
  appId: "cn.dsponline.network",
  appName: "DSP极简网络",
  webDir: "dist",
  backgroundColor: "#090d0c",
  appendUserAgent: ` DSPIdleNetworkAndroid/${packageVersion}`,
  loggingBehavior: androidDebug ? "debug" : "none",
  zoomEnabled: false,
  android: {
    backgroundColor: "#090d0c",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: androidDebug,
    minWebViewVersion: 119,
  },
  server: {
    hostname: "localhost",
    androidScheme: "https",
    cleartext: false,
    allowNavigation: [],
  },
  plugins: {
    App: {
      disableBackButtonHandler: true,
    },
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 8_000,
      backgroundColor: "#090d0cff",
      showSpinner: true,
      spinnerColor: "#62b5ae",
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#090d0c",
    },
  },
};

export default config;
