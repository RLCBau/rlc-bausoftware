import path from "node:path";
import QRCode from "qrcode";
import { createRlcServerPairing } from "../services/enterpriseProvisioning";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

async function main() {
  const apiUrl = argument("--api-url");
  const serverName = argument("--server-name");
  const companyCode = argument("--company-code");
  const output = argument("--output") || "rlc-server-pairing.svg";
  const expires = Number(argument("--expires") || 600);

  if (apiUrl) process.env.RLC_PUBLIC_API_URL = apiUrl;
  if (serverName) process.env.RLC_SERVER_NAME = serverName;
  if (companyCode) process.env.RLC_COMPANY_CODE = companyCode;

  const pairing = createRlcServerPairing(expires);
  const outputPath = path.resolve(output);
  await QRCode.toFile(outputPath, pairing.qrValue, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 640,
    color: { dark: "#0B2545", light: "#FFFFFF" },
  });

  console.log(`RLC Server-QR: ${outputPath}`);
  console.log(`Server: ${pairing.payload.serverName}`);
  console.log(`API: ${pairing.payload.apiUrl}`);
  console.log(`Gültig bis: ${new Date(pairing.payload.expiresAt).toISOString()}`);
}

main().catch((error) => {
  console.error(String(error?.message || error || "Pairing konnte nicht erstellt werden"));
  process.exit(1);
});

