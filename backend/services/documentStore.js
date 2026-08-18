import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb, isFirebaseConfigured } from "../firebase/initFirebase.js";

// Files are stored on the server's local disk (free, no cloud storage needed);
// the analysis + metadata live in Firestore so the agent can recall them.
// All functions are best-effort and no-op when Firebase isn't configured.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

function docsCollection(userId) {
    return getDb().collection("users").doc(userId).collection("documents");
}

// Persist an analyzed document: the raw file goes to local disk, the extracted
// analysis + metadata go to Firestore. Returns the saved record or null.
export async function saveDocument({ userId, imageBase64, mimeType, analysis, fileName }) {
    if (!isFirebaseConfigured() || !userId || !imageBase64) return null;
    try {
        const docId = randomUUID();
        const ext = (mimeType && mimeType.split("/")[1]) || "png";
        const relPath = path.join(userId, `${docId}.${ext}`);

        const userDir = path.join(UPLOADS_DIR, userId);
        fs.mkdirSync(userDir, { recursive: true });
        fs.writeFileSync(
            path.join(UPLOADS_DIR, relPath),
            Buffer.from(imageBase64, "base64")
        );

        const record = {
            fileName: fileName || `document.${ext}`,
            mimeType: mimeType || "image/png",
            storagePath: relPath,
            analysis: analysis || {},
            uploadedAt: new Date().toISOString(),
        };
        await docsCollection(userId).doc(docId).set(record);

        return { docId, ...record };
    } catch (error) {
        console.error("saveDocument error:", error.message);
        return null;
    }
}

// List a user's documents (analysis + metadata, newest first). No file bytes.
export async function listDocuments(userId) {
    if (!isFirebaseConfigured() || !userId) return [];
    try {
        const snap = await docsCollection(userId)
            .orderBy("uploadedAt", "desc")
            .get();
        return snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
    } catch (error) {
        console.error("listDocuments error:", error.message);
        return [];
    }
}

// Read one document's stored file from disk (for the "view" proxy endpoint).
export async function getDocumentFile(userId, docId) {
    if (!isFirebaseConfigured() || !userId) return null;
    try {
        const doc = await docsCollection(userId).doc(docId).get();
        if (!doc.exists) return null;
        const { storagePath, mimeType } = doc.data();
        const filePath = path.join(UPLOADS_DIR, storagePath);
        if (!fs.existsSync(filePath)) return null;
        return { buffer: fs.readFileSync(filePath), mimeType };
    } catch (error) {
        console.error("getDocumentFile error:", error.message);
        return null;
    }
}

// A compact text summary of the user's stored documents, for grounding the
// agent so it "remembers" what the user has uploaded across sessions.
export async function getDocumentContext(userId, limit = 5) {
    const docs = await listDocuments(userId);
    if (!docs.length) return "";
    return docs
        .slice(0, limit)
        .map((d) => {
            const a = d.analysis || {};
            const when = (d.uploadedAt || "").slice(0, 10);
            return `- ${a.title || d.fileName} (uploaded ${when}): ${a.summary || ""}`;
        })
        .join("\n");
}
