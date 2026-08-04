export function alignToDevicePixel(value: number, devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio): number {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.round(value * ratio) / ratio;
}

