const { ipcRenderer } = require("electron");

const expectedBytes = Number(process.env.DSP_ELECTRON_TRANSFER_SMOKE_BYTES || 1024 * 1024);
window.addEventListener("DOMContentLoaded", () => {
  const channel = new MessageChannel();
  let requestOffset = 0;
  let responseBytes = 0;
  let responseFirst = null;
  let responseLast = null;
  const sendNextRequest = (ack) => {
    if (ack !== undefined && ack !== requestOffset) throw new Error(`Request ACK mismatch: ${ack}/${requestOffset}`);
    if (requestOffset >= expectedBytes) {
      channel.port1.postMessage({ requestEnd: true, totalBytes: requestOffset });
      return;
    }
    const end = Math.min(expectedBytes, requestOffset + 1024 * 1024);
    const request = new Uint8Array(end - requestOffset);
    if (requestOffset === 0) request[0] = 7;
    requestOffset = end;
    channel.port1.postMessage({ requestChunk: request, offset: requestOffset });
  };
  channel.port1.onmessage = ({ data }) => {
    if (data?.requestAck !== undefined) {
      sendNextRequest(data.requestAck);
      return;
    }
    if (data?.responseChunk instanceof Uint8Array) {
      if (responseBytes === 0) responseFirst = data.responseChunk[0];
      responseBytes += data.responseChunk.byteLength;
      responseLast = data.responseChunk[data.responseChunk.byteLength - 1];
      channel.port1.postMessage({ responseAck: responseBytes });
      return;
    }
    if (data?.responseEnd) {
      ipcRenderer.send("smoke:done", {
        ok: responseBytes === expectedBytes && data.totalBytes === expectedBytes && responseFirst === 17 && responseLast === 29,
        bytes: responseBytes,
      });
    }
  };
  ipcRenderer.postMessage("smoke:port", null, [channel.port2]);
  sendNextRequest();
});
