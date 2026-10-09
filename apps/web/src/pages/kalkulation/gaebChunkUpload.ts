/** Creates Cloudflare Free-compatible multipart archive pieces (45 MiB maximum). */
export function splitGaebArchiveForUpload(files: File[], partBytes = 45 * 1024 * 1024): File[] {
  const result: File[] = [];
  for (const file of files) {
    if (file.size <= partBytes) {
      result.push(file);
      continue;
    }
    if (!/\.(zip|7z)$/i.test(file.name) || files.length !== 1) {
      throw new Error("Große geteilte Archive müssen aus Teilen unter 45 MiB bestehen.");
    }
    const count = Math.ceil(file.size / partBytes);
    if (count > 20) throw new Error("Archiv zu groß: maximal 20 Teile erlaubt.");
    for (let i = 0; i < count; i++) {
      result.push(new File(
        [file.slice(i * partBytes, (i + 1) * partBytes)],
        `${file.name}.${String(i + 1).padStart(3, "0")}`,
        { type: "application/octet-stream" }
      ));
    }
  }
  return result;
}
