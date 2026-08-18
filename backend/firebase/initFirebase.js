import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

// Firebase is only used by the optional /user profile route. We initialize it
// lazily so the rest of the backend (advice, translate) can boot and run even
// when no service-account credentials are configured.
let dbInstance = null;

export function getDb() {
    if (dbInstance) return dbInstance;

    const rawPath =
        process.env.FIREBASE_SA_PATH ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        "";
    const saPath = rawPath && rawPath.trim();

    if (!saPath) {
        throw new Error(
            "Firebase is not configured. Set FIREBASE_SA_PATH to your service account JSON to use the /user route."
        );
    }

    const serviceAccount = JSON.parse(fs.readFileSync(saPath, "utf8"));
    const app = initializeApp({
        credential: cert(serviceAccount),
    });

    dbInstance = getFirestore(app);
    return dbInstance;
}
