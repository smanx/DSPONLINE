export interface TextFileExport {
  contents: string;
  fileName: string;
  mimeType?: string;
  title?: string;
}

interface AndroidTextExportPlugin {
  exportAndShare(options: Required<Pick<TextFileExport, "contents" | "fileName">> & {
    mimeType: string;
    title: string;
  }): Promise<{ fileName: string; byteLength: number; chooserOpened: true }>;
}

export function safeExportFileName(value: string): string {
  const normalized = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim();
  return (normalized || "dsp-export.json").slice(0, 120);
}

export async function exportTextFile({ contents, fileName, mimeType = "application/json", title = "导出 DSP极简网络数据" }: TextFileExport): Promise<"native" | "browser"> {
  const safeName = safeExportFileName(fileName);
  if (__APP_PLATFORM__ === "android") {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      if (!Capacitor.isPluginAvailable("DspTextExport")) throw new Error("当前 Android 版本不支持安全文件导出");
      const result = await registerPlugin<AndroidTextExportPlugin>("DspTextExport").exportAndShare({
        contents,
        fileName: safeName,
        mimeType,
        title,
      });
      if (!result.chooserOpened) throw new Error("系统保存或分享面板未能打开");
      return "native";
    }
  }

  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return "browser";
}
