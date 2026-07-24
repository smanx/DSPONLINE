const assert = require("node:assert/strict");
const test = require("node:test");
const { createReleaseChannels, resolveReleaseChannel } = require("./release-channels.cjs");

test("community desktop builds have no update source by default", () => {
  const channels = createReleaseChannels();
  assert.equal(channels.stable.url, null);
  assert.equal(channels.beta.url, null);
  assert.equal(channels.nightly.url, null);
});

test("official desktop builds derive HTTPS channel URLs from an explicit base", () => {
  const channels = createReleaseChannels({ updateBaseUrl: "https://updates.example.test/desktop/" });
  assert.equal(channels.stable.url, "https://updates.example.test/desktop/stable");
  assert.equal(channels.beta.url, "https://updates.example.test/desktop/beta");
  assert.equal(channels.nightly.url, "https://updates.example.test/desktop/nightly");
  assert.equal(resolveReleaseChannel("BETA", channels), "beta");
  assert.equal(resolveReleaseChannel("unknown", channels), "stable");
});

test("desktop update channels reject cleartext configuration", () => {
  assert.throws(() => createReleaseChannels({ updateBaseUrl: "http://updates.example.test" }), /HTTPS/);
  assert.throws(() => createReleaseChannels({ stableUrl: "http://updates.example.test/stable" }), /HTTPS/);
});
