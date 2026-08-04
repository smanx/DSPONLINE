import { Download, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  checkNativeUpdate,
  downloadNativeUpdate,
  getNativeReleaseInfo,
  installNativeUpdate,
  subscribeNativeUpdate,
  type NativeReleaseInfo,
} from "../nativeApp";

export function NativeUpdateCard({ className = "", showWebFallback = false }: { className?: string; showWebFallback?: boolean }) {
  const [release, setRelease] = useState<NativeReleaseInfo | null>(null);

  useEffect(() => {
    let active = true;
    void getNativeReleaseInfo().then((info) => {
      if (!active) return;
      setRelease(info);
      if (info?.platform === "android" && info.update.state === "idle") {
        void checkNativeUpdate().then((update) => {
          if (active && update) setRelease((current) => current ? { ...current, update } : current);
        }).catch(() => undefined);
      }
    }).catch(() => undefined);
    const unsubscribe = subscribeNativeUpdate((update) => {
      if (!active) return;
      setRelease((current) => current ? { ...current, update } : current);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const check = useCallback(async () => {
    const update = await checkNativeUpdate().catch(() => null);
    if (update) setRelease((current) => current ? { ...current, update } : current);
  }, []);
  const download = useCallback(async () => {
    const update = await downloadNativeUpdate().catch(() => null);
    if (update) setRelease((current) => current ? { ...current, update } : current);
  }, []);
  const install = useCallback(async () => { await installNativeUpdate().catch(() => ({ accepted: false })); }, []);

  if (!release && !showWebFallback) return null;
  return <section className={`settings-group desktop-release-status native-update-card ${className}`.trim()}>
    <header><Download size={14} /><span>应用版本</span><small>{release ? `${release.platformLabel} · ${release.channelLabel} · v${release.version}` : "Web / PWA"}</small></header>
    {release ? <>
      <div className={`desktop-update-state desktop-update-state--${release.update.state}`} role="status"><span>{release.update.message}</span>{release.update.progress != null ? <strong>{release.update.progress}%</strong> : null}</div>
      {release.update.required ? <p className="settings-buffer-error">当前版本低于最低支持版本，请尽快更新。</p> : null}
      {release.update.downloadSize ? <p className="settings-help">安装包 {(release.update.downloadSize / 1024 / 1024).toFixed(1)} MiB · SHA-256 {release.update.sha256?.slice(0, 12)}…</p> : null}
      <div className="desktop-update-actions">
        <button type="button" disabled={release.update.state === "checking" || release.update.state === "downloading"} onClick={() => void check()}><RotateCcw size={13} />检查更新</button>
        {release.update.state === "available" || release.update.state === "opening-download" ? <button className="primary" type="button" onClick={() => void download()}><Download size={13} />{release.platform === "android" ? "下载安装包" : "下载更新"}</button> : null}
        {release.update.state === "downloaded" ? <button className="primary" type="button" onClick={() => void install()}><Download size={13} />重启安装</button> : null}
      </div>
    </> : <p className="settings-help">当前使用网页版本。桌面与 Android 应用支持稳定版、Beta 和 Nightly 更新通道。</p>}
  </section>;
}
