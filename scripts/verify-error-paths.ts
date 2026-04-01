import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFileCatalogSnapshot } from "../src/core/files.js";
import { readHomelabStatus } from "../src/core/homelab.js";
import { readWindowsHostStatus } from "../src/core/host.js";
import { readPlexActivitySnapshot } from "../src/core/plex-activity.js";
import { readPlexLibraryIndex } from "../src/core/plex.js";
import { readRepoStatusSnapshot } from "../src/core/repos.js";
import { readSnapshotOverview } from "../src/core/snapshots.js";
import { startHttp } from "../src/transports/http.js";

async function writeMalformedJson(tempDir: string, fileName: string) {
  const filePath = path.join(tempDir, fileName);
  await fs.writeFile(filePath, '{"broken": ', "utf8");
  return filePath;
}

async function expectReaderFailure(
  label: string,
  run: () => Promise<unknown>,
  expectedPrefix: string
) {
  try {
    await run();
    throw new Error(`${label} unexpectedly succeeded`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.ok(
      message.startsWith(expectedPrefix),
      `${label} returned the wrong error.\nExpected prefix: ${expectedPrefix}\nActual: ${message}`
    );
    assert.ok(message.length > expectedPrefix.length, `${label} did not include the original parser error message.`);
  }
}

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-home-error-paths-"));

  const originalEnv = {
    PORT: process.env.PORT,
    MCP_AUTH_MODE: process.env.MCP_AUTH_MODE,
    SNAPSHOT_STATUS_PATH: process.env.SNAPSHOT_STATUS_PATH
  };

  try {
    const homelabPath = await writeMalformedJson(tempDir, "homelab-status.json");
    await expectReaderFailure(
      "readHomelabStatus",
      () => readHomelabStatus(homelabPath),
      `Failed to read/parse homelab status at ${homelabPath}: `
    );

    const fileCatalogPath = await writeMalformedJson(tempDir, "file-catalog.json");
    await expectReaderFailure(
      "readFileCatalogSnapshot",
      () => readFileCatalogSnapshot(fileCatalogPath),
      `Failed to read/parse file catalog snapshot at ${fileCatalogPath}: `
    );

    const plexLibraryIndexPath = await writeMalformedJson(tempDir, "plex-library-index.json");
    await expectReaderFailure(
      "readPlexLibraryIndex",
      () => readPlexLibraryIndex(plexLibraryIndexPath),
      `Failed to read/parse Plex library index at ${plexLibraryIndexPath}: `
    );

    const plexActivityPath = await writeMalformedJson(tempDir, "plex-activity.json");
    await expectReaderFailure(
      "readPlexActivitySnapshot",
      () => readPlexActivitySnapshot(plexActivityPath),
      `Failed to read/parse Plex activity snapshot at ${plexActivityPath}: `
    );

    const repoStatusPath = await writeMalformedJson(tempDir, "repo-status.json");
    await expectReaderFailure(
      "readRepoStatusSnapshot",
      () => readRepoStatusSnapshot(repoStatusPath),
      `Failed to read/parse repo status snapshot at ${repoStatusPath}: `
    );

    const windowsHostStatusPath = await writeMalformedJson(tempDir, "windows-host-status.json");
    await expectReaderFailure(
      "readWindowsHostStatus",
      () => readWindowsHostStatus(windowsHostStatusPath),
      `Failed to read/parse Windows host status at ${windowsHostStatusPath}: `
    );

    const snapshotStatusPath = await writeMalformedJson(tempDir, "snapshot-status.json");
    process.env.SNAPSHOT_STATUS_PATH = snapshotStatusPath;
    await expectReaderFailure(
      "readSnapshotOverview",
      () => readSnapshotOverview(),
      `Failed to read/parse snapshot status file at ${snapshotStatusPath}: `
    );

    process.env.PORT = "abc";
    process.env.MCP_AUTH_MODE = "none";
    await assert.rejects(
      () => startHttp(),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        assert.equal(
          message,
          'Invalid PORT value: "abc". Must be an integer between 1 and 65535.'
        );
        return true;
      }
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          checkedReaders: [
            "readHomelabStatus",
            "readFileCatalogSnapshot",
            "readPlexLibraryIndex",
            "readPlexActivitySnapshot",
            "readRepoStatusSnapshot",
            "readSnapshotOverview",
            "readWindowsHostStatus"
          ],
          checkedTransport: "startHttp PORT validation"
        },
        null,
        2
      )
    );
  } finally {
    if (originalEnv.PORT === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalEnv.PORT;
    }

    if (originalEnv.MCP_AUTH_MODE === undefined) {
      delete process.env.MCP_AUTH_MODE;
    } else {
      process.env.MCP_AUTH_MODE = originalEnv.MCP_AUTH_MODE;
    }

    if (originalEnv.SNAPSHOT_STATUS_PATH === undefined) {
      delete process.env.SNAPSHOT_STATUS_PATH;
    } else {
      process.env.SNAPSHOT_STATUS_PATH = originalEnv.SNAPSHOT_STATUS_PATH;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
