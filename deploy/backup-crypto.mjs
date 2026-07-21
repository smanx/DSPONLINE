import { constants, createCipheriv, createDecipheriv, createHash, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, rename, rm, stat } from "node:fs/promises";

const MAGIC = Buffer.from("DSPBKUP1", "ascii");
const TAG_LENGTH = 16;
const MAX_HEADER_BYTES = 64 * 1024;

async function writeAll(handle, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset, position + offset);
    if (bytesWritten <= 0) throw new Error("encrypted backup write made no progress");
    offset += bytesWritten;
  }
}

async function readExactly(handle, length, position) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
    if (bytesRead <= 0) throw new Error("encrypted backup is truncated");
    offset += bytesRead;
  }
  return buffer;
}

function prefixFor(header) {
  const headerBuffer = Buffer.from(JSON.stringify(header), "utf8");
  if (headerBuffer.length > MAX_HEADER_BYTES) throw new Error("encrypted backup header is too large");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(headerBuffer.length);
  return Buffer.concat([MAGIC, length, headerBuffer]);
}

export async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function encryptBackupFile(input, output, publicKey) {
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  const wrappedKey = publicEncrypt({
    key: publicKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, dataKey);
  const header = {
    version: 1,
    keyAlgorithm: "RSA-OAEP-SHA256",
    cipher: "AES-256-GCM",
    wrappedKey: wrappedKey.toString("base64"),
    iv: iv.toString("base64"),
  };
  const prefix = prefixFor(header);
  const temporary = `${output}.${process.pid}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  let position = 0;
  try {
    await writeAll(handle, prefix, position);
    position += prefix.length;
    const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
    cipher.setAAD(prefix);
    for await (const chunk of createReadStream(input)) {
      const encrypted = cipher.update(chunk);
      await writeAll(handle, encrypted, position);
      position += encrypted.length;
    }
    const final = cipher.final();
    await writeAll(handle, final, position);
    position += final.length;
    await writeAll(handle, cipher.getAuthTag(), position);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporary, { force: true });
    throw error;
  }
  await handle.close();
  await rename(temporary, output);
}

export async function decryptBackupFile(input, output, privateKey) {
  const source = await open(input, "r");
  const temporary = `${output}.${process.pid}.tmp`;
  let destination;
  try {
    const magic = await readExactly(source, MAGIC.length, 0);
    if (!magic.equals(MAGIC)) throw new Error("unsupported encrypted backup format");
    const lengthBuffer = await readExactly(source, 4, MAGIC.length);
    const headerLength = lengthBuffer.readUInt32BE(0);
    if (headerLength <= 0 || headerLength > MAX_HEADER_BYTES) throw new Error("invalid encrypted backup header length");
    const headerBuffer = await readExactly(source, headerLength, MAGIC.length + 4);
    const header = JSON.parse(headerBuffer.toString("utf8"));
    if (header.version !== 1 || header.keyAlgorithm !== "RSA-OAEP-SHA256" || header.cipher !== "AES-256-GCM") {
      throw new Error("unsupported encrypted backup algorithms");
    }
    const prefix = Buffer.concat([magic, lengthBuffer, headerBuffer]);
    const wrappedKey = Buffer.from(header.wrappedKey, "base64");
    const iv = Buffer.from(header.iv, "base64");
    if (iv.length !== 12 || wrappedKey.length < 128) throw new Error("invalid encrypted backup key material");
    const dataKey = privateDecrypt({
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    }, wrappedKey);
    const sourceStat = await stat(input);
    const ciphertextStart = prefix.length;
    const tagStart = sourceStat.size - TAG_LENGTH;
    if (tagStart <= ciphertextStart) throw new Error("encrypted backup has no ciphertext");
    const authTag = await readExactly(source, TAG_LENGTH, tagStart);
    const decipher = createDecipheriv("aes-256-gcm", dataKey, iv);
    decipher.setAAD(prefix);
    decipher.setAuthTag(authTag);
    destination = await open(temporary, "wx", 0o600);
    let position = 0;
    for await (const chunk of createReadStream(input, { start: ciphertextStart, end: tagStart - 1 })) {
      const plain = decipher.update(chunk);
      await writeAll(destination, plain, position);
      position += plain.length;
    }
    const final = decipher.final();
    await writeAll(destination, final, position);
    await destination.sync();
    await destination.close();
    destination = null;
    await rename(temporary, output);
  } catch (error) {
    await destination?.close().catch(() => undefined);
    await rm(temporary, { force: true });
    throw error;
  } finally {
    await source.close();
  }
}
