const missing = ["CSC_LINK", "CSC_KEY_PASSWORD"].filter((name) => !process.env[name]?.trim());
if (missing.length > 0) throw new Error(`Windows release signing is not configured: ${missing.join(", ")}`);
console.log("Windows release signing credentials are configured");
