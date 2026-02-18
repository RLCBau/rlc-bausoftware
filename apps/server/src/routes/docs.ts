import express from "express";
const router = express.Router();

/** Demo in-memory */
const demoDocs = [
  { id: "doc-001", name: "Plan_Ausschnitt.pdf", pages: 1, previewUrl: "" },
  { id: "doc-002", name: "Leitung_Grundriss.dwg", pages: 1, previewUrl: "" },
];

router.get("/", (_req, res) => {
  res.json({ docs: demoDocs });
});

export default router;
