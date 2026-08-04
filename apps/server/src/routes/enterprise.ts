import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import { requireCompany, requireActiveSubscription } from "../middleware/guards";
import { requireServerLicense } from "../middleware/license";
import {
  createRlcServerPairing,
  getRlcServerIdentity,
  verifyRlcServerPairing,
} from "../services/enterpriseProvisioning";

const router = Router();

const VerifyRequest = z.object({ token: z.string().min(20).max(20_000) });
const CreateRequest = z.object({
  expiresInSeconds: z.number().int().min(60).max(3600).optional(),
});

router.get("/identity", (_req, res) => {
  try {
    return res.json({ ok: true, ...getRlcServerIdentity() });
  } catch (error: any) {
    return res.status(503).json({
      ok: false,
      error: String(error?.message || error || "Server identity unavailable"),
    });
  }
});

router.post("/pairing/verify", (req, res) => {
  try {
    const { token } = VerifyRequest.parse(req.body || {});
    const pairing = verifyRlcServerPairing(token);
    const identity = getRlcServerIdentity();
    return res.json({
      ok: true,
      verified: true,
      profile: {
        serverId: pairing.serverId,
        serverName: pairing.serverName,
        companyCode: pairing.companyCode,
        apiUrl: pairing.apiUrl,
        aiMode: identity.aiMode,
        capabilities: identity.capabilities,
      },
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      verified: false,
      error: String(error?.message || error || "Pairing verification failed"),
    });
  }
});

router.use(
  requireAuth,
  requireServerLicense(),
  requireVerifiedEmail,
  requireCompany,
  requireActiveSubscription
);

router.post("/pairing", async (req: any, res) => {
  try {
    const role = String(req?.auth?.role || req?.user?.role || "").toUpperCase();
    const dev = String(process.env.DEV_AUTH || "").toLowerCase() === "on";
    const anyAuthenticated =
      String(process.env.RLC_ENTERPRISE_PAIRING_ANY_AUTH || "").toLowerCase() ===
      "on";
    if (!dev && !anyAuthenticated && !["ADMIN", "OWNER", "SUPERADMIN"].includes(role)) {
      return res.status(403).json({ ok: false, error: "ADMIN_REQUIRED" });
    }

    const body = CreateRequest.parse(req.body || {});
    const pairing = createRlcServerPairing(body.expiresInSeconds);
    const qrSvg = await QRCode.toString(pairing.qrValue, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 420,
      color: { dark: "#0B2545", light: "#FFFFFF" },
    });

    return res.json({
      ok: true,
      qrValue: pairing.qrValue,
      qrSvg,
      expiresAt: new Date(pairing.payload.expiresAt).toISOString(),
      server: {
        serverId: pairing.payload.serverId,
        serverName: pairing.payload.serverName,
        companyCode: pairing.payload.companyCode,
        apiUrl: pairing.payload.apiUrl,
      },
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      error: String(error?.message || error || "Pairing creation failed"),
    });
  }
});

export default router;

