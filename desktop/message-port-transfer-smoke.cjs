const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

const expectedBytes = Number(process.env.DSP_ELECTRON_TRANSFER_SMOKE_BYTES || 1024 * 1024);
let window = null;

function fail(error) {
  console.error(error instanceof Error ? error.stack || error.message : error);
  app.exit(1);
}

ipcMain.on("smoke:port", (event) => {
  const port = event.ports?.[0];
  if (!port) return fail(new Error("MessagePortMain missing"));
  let receivedBytes = 0;
  port.on("message", ({ data }) => {
    if (data?.responseAck !== undefined) return;
    const received = data?.requestChunk;
    if (received instanceof Uint8Array) {
      receivedBytes += received.byteLength;
      if (data.offset !== receivedBytes || receivedBytes > expectedBytes) {
        return fail(new Error(`Renderer to main chunk mismatch: ${receivedBytes}/${data.offset}`));
      }
      port.postMessage({ requestAck: receivedBytes });
      return;
    }
    if (data?.requestEnd !== true || data.totalBytes !== expectedBytes || receivedBytes !== expectedBytes) {
      return fail(new Error(`Renderer to main transfer mismatch: ${receivedBytes}; data=${Object.prototype.toString.call(data)} keys=${Object.keys(data ?? {}).join(",")}`));
    }
    let offset = 0;
    const sendNext = ({ data: ackData } = { data: {} }) => {
      if (ackData.responseAck !== undefined && ackData.responseAck !== offset) {
        return fail(new Error(`Renderer response ACK mismatch: ${ackData.responseAck}/${offset}`));
      }
      if (offset >= expectedBytes) {
        port.removeListener("message", sendNext);
        port.postMessage({ responseEnd: true, totalBytes: offset });
        return;
      }
      const end = Math.min(expectedBytes, offset + 1024 * 1024);
      const response = new Uint8Array(end - offset);
      if (offset === 0) response[0] = 17;
      if (end === expectedBytes) response[response.length - 1] = 29;
      offset = end;
      port.postMessage({ responseChunk: response, receivedBytes: offset });
    };
    port.on("message", sendNext);
    port.postMessage({ responseStart: { status: 200 } });
    sendNext();
  });
  port.start();
});

app.whenReady().then(async () => {
  window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, preload: path.join(__dirname, "message-port-transfer-smoke-preload.cjs") } });
  ipcMain.once("smoke:done", (_event, result) => {
    if (result?.ok === true && result.bytes === expectedBytes) app.exit(0);
    else fail(new Error(`Main to renderer transfer mismatch: ${JSON.stringify(result)}`));
  });
  await window.loadURL("data:text/html,<title>DSP transfer smoke</title>");
}).catch(fail);

setTimeout(() => fail(new Error("Electron MessagePort transfer smoke timed out")), 30_000).unref();
