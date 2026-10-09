import assert from "node:assert/strict";
import { test } from "node:test";
import { splitGaebArchiveForUpload } from "./gaebChunkUpload.ts";

test("GAEB ZIP is split into valid sequential pieces", () => {
  const bytes = 101 * 1024 * 1024;
  const input = new File([new Uint8Array(bytes)], "synthetic.zip");
  const parts = splitGaebArchiveForUpload([input]);
  assert.equal(parts.length, 3);
  assert.deepEqual(parts.map((part) => part.name), [
    "synthetic.zip.001", "synthetic.zip.002", "synthetic.zip.003",
  ]);
  assert.equal(parts.reduce((sum, part) => sum + part.size, 0), bytes);
  assert.ok(parts.every((part) => part.size <= 45 * 1024 * 1024));
});

test("Small GAEB archives are sent unchanged", () => {
  const input = new File([new Uint8Array(1024)], "synthetic.7z");
  assert.equal(splitGaebArchiveForUpload([input])[0], input);
});

test("Oversized pre-split archives are rejected", () => {
  const input = new File([new Uint8Array(46 * 1024 * 1024)], "synthetic.zip.001");
  assert.throws(() => splitGaebArchiveForUpload([input]), /Teilen/);
});

test("More than 20 parts are rejected", () => {
  const input = new File([new Uint8Array(901 * 1024 * 1024)], "synthetic.zip");
  assert.throws(() => splitGaebArchiveForUpload([input]), /20 Teile/);
});
