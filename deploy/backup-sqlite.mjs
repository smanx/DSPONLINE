import { backupSqlite, inspectCloudDatabase } from "./sqlite-snapshot.mjs";

const [source, destination] = process.argv.slice(2);

if (!source || !destination) {
  console.error("Usage: node backup-sqlite.mjs <source> <destination>");
  process.exit(1);
}

await backupSqlite(source, destination);
inspectCloudDatabase(destination);
console.log(destination);
