# 原生应用构建与更新

> 当前应用候选版本：`1.0.0`
> Windows 包名：`com.dspidle.network`
> Android applicationId：`cn.dsponline.network`
> 原生应用与 Web 共用 `GameState` v34、存档 envelope v2 和云 schema v7。

## 1. 架构边界

- Windows 使用 Electron，加载本地 `dist/`，启用 context isolation、sandbox、单实例和受限 IPC。
- Android 使用 Capacitor 8，加载打包进 APK 的同一套 Vite 资源，默认采用新版手机 UI，经典 UI 仍可回退。
- PWA 在 Electron 和 Android 中不注册，避免 service worker 与安装包版本形成双重更新源。
- 原生生命周期只触发既有保存流程，不修改模拟步长、GameState 或云存档格式。
- Android 与 Windows 各自保留本机应用数据。覆盖安装和同签名升级不会清除本地存档；卸载应用仍会删除系统应用数据，因此正式发布前必须继续提供导出和云存档。
- Android JSON 导出通过应用缓存目录与系统分享面板完成；Web/Electron 继续使用浏览器下载。

## 2. 开发环境

共同要求：

```powershell
npm ci
npm run typecheck
```

Windows 目录包：

```powershell
npm run desktop:pack
```

Android 要求 JDK 21、Android SDK 36 和 Build Tools。当前 Wrapper 固定 Gradle 8.14.3，并使用带 SHA-256 校验的腾讯云镜像以避免 GitHub 分发下载超时。

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run android:debug
```

调试 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。它使用 Android 调试证书，只能试玩，不能进入稳定更新源。

## 3. 版本与通道

- `package.json.version` 是 Windows `app.getVersion()` 和 Android `versionName` 的来源。
- Android 稳定版默认把 `major.minor.patch` 映射为 `major * 1,000,000 + minor * 1,000 + patch`；`1.0.0` 对应 `1000000`。
- Beta、Nightly 或 SemVer prerelease 必须显式设置新的 `DSP_ANDROID_VERSION_CODE`，避免 Android 认为新包不是升级。
- `DSP_RELEASE_CHANNEL` 只允许 `stable / beta / nightly`。平台构建脚本把同一通道写入 Vite 常量、Android 版本属性和 Electron 打包元数据；安装后不会回落到 Stable。

## 4. 正式签名

Windows 正式安装包需要：

```text
CSC_LINK
CSC_KEY_PASSWORD
```

`npm run desktop:release` 在缺少签名配置时会失败；`npm run desktop:dist` 仅用于本机未签名验收。

Android 正式包需要长期保管且永不更换的 keystore：

```text
DSP_ANDROID_KEYSTORE
DSP_ANDROID_KEYSTORE_PASSWORD
DSP_ANDROID_KEY_ALIAS
DSP_ANDROID_KEY_PASSWORD
```

正式命令：

```powershell
npm run android:release
```

没有这些变量时可用 `npm run android:release:unsigned` 验证 Release 编译，但未签名 APK/AAB 不得交付玩家。密钥、密码和证书私钥不能提交到 Git、文档、日志或 VPS Web 目录。

## 5. 更新源

Windows 应用读取：

```text
https://dsponline.cn/downloads/desktop/stable
https://dsponline.cn/downloads/desktop/beta
https://dsponline.cn/downloads/desktop/nightly
```

Android 应用读取：

```text
https://dsponline.cn/downloads/android/stable.json
https://dsponline.cn/downloads/android/beta.json
https://dsponline.cn/downloads/android/nightly.json
```

Android 清单只接受 schema v1、`cn.dsponline.network`、当前通道、同源 HTTPS 且位于 `/downloads/android/` 的 APK。发布工具默认拒绝文件名包含 `debug` 或 `unsigned` 的 APK，并要求用 `apksigner` 验证 APK Signature Scheme v2+ 和批准的证书 SHA-256 指纹。

示例：

```powershell
node scripts/create-native-update-manifests.mjs `
  --channel stable `
  --android-apk android/app/build/outputs/apk/release/app-release.apk `
  --android-certificate-sha256 <公开证书指纹>
```

Windows 的 `latest.yml`、安装程序和 blockmap 由 `npm run desktop:release` 整理到 `release/update-feed/desktop/<channel>/`。Android JSON 与 APK 整理到 `release/update-feed/android/`。这些命令只生成待发布目录，不上传服务器。

## 6. CI 与发布门禁

- `.github/workflows/desktop-release.yml` 使用 Windows 代码签名机密生成安装包和桌面更新目录。
- `.github/workflows/android-release.yml` 从 GitHub Secret 临时恢复 keystore，生成签名 APK/AAB，并校验批准证书后生成更新清单。
- CI 只上传 GitHub Actions 制品，不自动部署 VPS。
- 向正式更新目录发布前仍需核对版本、通道、SHA-256、证书、安装覆盖、本地存档、云登录、回滚版本和 HTTPS 缓存头。

## 7. 当前发布门槛

- 已验证 Windows 未安装目录包启动、`file://` 加载、版本桥接和受限 HTTPS API。
- 已验证 Android API 36.1 模拟器冷启动、覆盖安装保留本地进度、竖横屏和新版手机壳。
- 最终 `1.0.0` 编译门禁再次生成 Windows 目录包、4,103,392 字节 unsigned APK 和 3,917,492 字节 AAB；Android 版本为 `1000000`、minSdk 24。EXE Authenticode 为 `NotSigned`，APK 也未通过 `apksigner`，符合未配置正式密钥时的预期拒绝路径。
- 正式 Windows 证书和 Android 长期 keystore 尚未配置，因此当前制品是本地预览，不是可公开自动更新的正式安装包。
- Android 系统浏览器安装 APK 时，玩家设备可能要求允许该来源安装应用；正式商店分发可作为后续渠道，但不改变包名和签名连续性要求。
- iOS 壳层、App Store/Google Play 发布、崩溃收集和物理 Android/iPhone 30 分钟温度耗电测试仍在后续范围。
