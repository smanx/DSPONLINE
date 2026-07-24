import { access } from "node:fs/promises";
import path from "node:path";

const required = [
  "DSP_ANDROID_KEYSTORE",
  "DSP_ANDROID_KEYSTORE_PASSWORD",
  "DSP_ANDROID_KEY_ALIAS",
  "DSP_ANDROID_KEY_PASSWORD",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) throw new Error(`Android release signing is not configured: ${missing.join(", ")}`);

const keystore = path.resolve(process.env.DSP_ANDROID_KEYSTORE);
await access(keystore).catch(() => { throw new Error("DSP_ANDROID_KEYSTORE does not point to a readable file"); });
console.log(`Android release signing configured for alias ${process.env.DSP_ANDROID_KEY_ALIAS}`);
