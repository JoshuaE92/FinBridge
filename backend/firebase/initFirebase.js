import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

// Firebase is initialized lazily so the rest of the backend boots even when no
// service-account credentials are configured. Persistence is treated as
// best-effort by callers — the app works without Firebase, it just won't save.
let app = null;

function credentialsPath() {
    const raw =
        process.env.FIREBASE_SA_PATH ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        "";
    return raw && raw.trim();
}

export function isFirebaseConfigured() {
    return Boolean(credentialsPath());
}

function getApp() {
    if (app) return app;

    const saPath = credentialsPath();
    if (!saPath) {
        throw new Error(
            "Firebase is not configured. Set FIREBASE_SA_PATH to your service account JSON."
        );
    }

    const serviceAccount = JSON.parse(fs.readFileSync(saPath, "utf8"));
    app = initializeApp({
        credential: cert(serviceAccount),
    });
    return app;
}

export function getDb() {
    return getFirestore(getApp());
}
