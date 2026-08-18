import express from "express";
import { getDb } from "../firebase/initFirebase.js";

const router = express.Router();

router.get("/:id", async (req, res) => {
    try {
        const db = getDb();
        const userRef = db.collection("users").doc(req.params.id);
        const userSnap = await userRef.get();

        if (userSnap.exists) {
            res.json(userSnap.data());
        } else {
            res.status(404).json({ message: "User not found" });
        }
    } catch (error) {
        console.error("Get user error:", error);
        res.status(503).json({ error: "User profiles are not available." });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const db = getDb();
        const { language, culture } = req.body;
        await db.collection("users").doc(req.params.id).set(
            {
                language,
                culture,
            },
            { merge: true }
        );
        res.json({ message: "User updated successfully" });
    } catch (error) {
        console.error("Update user error:", error);
        res.status(503).json({ error: "User profiles are not available." });
    }
});

export default router;
