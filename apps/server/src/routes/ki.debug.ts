// apps/server/src/routes/ki.debug.ts
import express from "express";

const r = express.Router();

// ⚠️ questo endpoint NON deve stare in prod pubblica senza protezione.
// Usalo solo in DEV o dietro auth.
r.post("/api/ki/debug/echo", (req, res) => {
  res.json({
    ok: true,
    headers: {
      "content-type": req.headers["content-type"],
      "content-length": req.headers["content-length"],
    },
    bodyKeys: req.body ? Object.keys(req.body) : [],
    body: req.body || null,
  });
});

export default r;
