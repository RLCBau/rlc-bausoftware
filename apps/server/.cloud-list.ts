import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3, bucket } from "./src/lib/s3";

async function run() {
  if (!s3) throw new Error("S3 provider non attivo");

  for (const prefix of ["projects/BA-2026-028/", "BA-2026-028/"]) {
    const result = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
    );

    console.log("=== " + prefix + " ===");
    for (const item of result.Contents || []) {
      console.log(String(item.Key) + " | " + String(item.Size || 0));
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});