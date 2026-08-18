import express from "express";
import { listDocuments, getDocumentFile } from "../services/documentStore.js";

const router = express.Router();

// List the user's saved documents (analysis + metadata).
router.get("/", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const documents = await listDocuments(userId);
    res.json({ documents });
});

// Stream a stored document's file back to the browser for viewing.
router.get("/:docId/file", async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const file = await getDocumentFile(userId, req.params.docId);
    if (!file) return res.status(404).json({ error: "Document not found" });

    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.send(file.buffer);
});

export default router;
