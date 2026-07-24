const DEFAULT_UPDATE_HOST = "https://dsponline.cn/downloads/desktop";

const channels = {
  stable: {
    label: "稳定版",
    url: process.env.DSP_UPDATE_STABLE_URL || `${DEFAULT_UPDATE_HOST}/stable`,
    allowPrerelease: false,
  },
  beta: {
    label: "Beta",
    url: process.env.DSP_UPDATE_BETA_URL || `${DEFAULT_UPDATE_HOST}/beta`,
    allowPrerelease: true,
  },
  nightly: {
    label: "Nightly",
    url: process.env.DSP_UPDATE_NIGHTLY_URL || `${DEFAULT_UPDATE_HOST}/nightly`,
    allowPrerelease: true,
  },
};

function resolveReleaseChannel(value) {
  const id = typeof value === "string" ? value.toLowerCase() : "";
  return channels[id] ? id : "stable";
}

module.exports = { channels, resolveReleaseChannel };
