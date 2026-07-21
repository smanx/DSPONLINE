import path from "node:path";
import { createRequire } from "node:module";

const [source, destination] = process.argv.slice(2);

if (!source || !destination) {
  console.error("Usage: node backup-sqlite.mjs <source> <destination>");
  process.exit(1);
}

const requireFromWorkingDirectory = createRequire(path.join(process.cwd(), "package.json"));
const Database = requireFromWorkingDirectory("better-sqlite3");
const database = new Database(source, { fileMustExist: true, readonly: true });

try {
  await database.backup(destination);
  console.log(destination);
} finally {
  database.close();
}
