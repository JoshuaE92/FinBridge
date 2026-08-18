import express from "express";
import { getFinancialAdvice } from "../services/geminiService.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const { message, language, culture } = req.body || {};

        if (!message || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({ error: "A message is required." });
        }

        // Gemini is multilingual, so it answers directly in the requested
        // language — no separate translation service needed.
        const reply = await getFinancialAdvice({
            message: message.trim(),
            language: language || "en",
            culture: culture || "American",
        });

        res.json({ reply });
    } catch (error) {
        console.error("Advice route error:", error);
        const body = { error: "Error generating advice" };
        // In development, expose the real cause (e.g. billing/model errors)
        // so failures are diagnosable from the UI instead of a generic message.
        if (process.env.NODE_ENV !== "production") {
            body.detail = error?.message;
        }
        res.status(500).json(body);
    }
});

export default router;
