export interface TextFileExport {
  contents: string;
  fileName: string;
  mimeType?: string;
  title?: string;
}

export function safeExportFileName(value: string): string {
  const normalized = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim();
  return (normalized || "dsp-export.json").slice(0, 120);
}

export async function exportTextFile({ contents, fileName, mimeType = "application/json", title = "导出 DSP极简网络数据" }: TextFileExport): Promise<"native" | "browser"> {
  const safeName = safeExportFileName(fileName);
  if (__APP_PLATFORM__ === "android") {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([
        import("@capacitor/filesystem"),
        import("@capacitor/share"),
      ]);
      const result = await Filesystem.writeFile({
        path: `exports/${safeName}`,
        data: contents,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      const capability = await Share.canShare();
      if (!capability.value) throw new Error("当前设备没有可用的文件分享目标");
      await Share.share({ title, dialogTitle: title, files: [result.uri] });
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
