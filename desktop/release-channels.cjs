function optionalHttpsUrl(value, label) {
  if (typeof value !== "string" || !value.trim()) return null;
  const target = new URL(value.trim());
  if (target.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  return target.toString().replace(/\/$/, "");
}

function createReleaseChannels({ updateBaseUrl, stableUrl, betaUrl, nightlyUrl } = {}) {
  const baseUrl = optionalHttpsUrl(updateBaseUrl, "Desktop update base URL");
  const channelUrl = (id, explicitUrl) => optionalHttpsUrl(
    explicitUrl || (baseUrl ? `${baseUrl}/${id}` : null),
    `Desktop ${id} update URL`,
  );
  return {
    stable: {
      label: "稳定版",
      url: channelUrl("stable", stableUrl),
      allowPrerelease: false,
    },
    beta: {
      label: "Beta",
      url: channelUrl("beta", betaUrl),
      allowPrerelease: true,
    },
    nightly: {
      label: "Nightly",
      url: channelUrl("nightly", nightlyUrl),
      allowPrerelease: true,
    },
  };
}

function resolveReleaseChannel(value, channels = createReleaseChannels()) {
  const id = typeof value === "string" ? value.toLowerCase() : "";
  return channels[id] ? id : "stable";
}

module.exports = { createReleaseChannels, optionalHttpsUrl, resolveReleaseChannel };
