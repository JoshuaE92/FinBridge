import express from "express";
import {
    explainDocument,
    answerDocumentQuestion,
} from "../services/geminiService.js";
import { getFinancialContext } from "../services/plaidService.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const { imageBase64, mimeType, question, language, culture } = req.body || {};

        if (!imageBase64 && (!question || !question.trim())) {
            return res
                .status(400)
                .json({ error: "Provide a document image or a question." });
        }

        // If a bank is linked, ground the explanation in the user's real balances.
        const financialContext = await getFinancialContext();

        const result = await explainDocument({
            imageBase64,
            mimeType,
            question: question?.trim(),
            language: language || "en",
            culture: culture || "American",
            financialContext,
        });

        res.json(result);
    } catch (error) {
        console.error("Explain route error:", error);
        const body = { error: "Error explaining document" };
        if (process.env.NODE_ENV !== "production") {
            body.detail = error?.message;
        }
        res.status(500).json(body);
    }
});

// Follow-up questions about the uploaded document.
router.post("/ask", async (req, res) => {
    try {
        const { imageBase64, mimeType, question, language, culture } = req.body || {};
        if (!question || !question.trim()) {
            return res.status(400).json({ error: "A question is required." });
        }

        const financialContext = await getFinancialContext();

        const answer = await answerDocumentQuestion({
            imageBase64,
            mimeType,
            question: question.trim(),
            language: language || "en",
            culture: culture || "American",
            financialContext,
        });

        res.json({ answer });
    } catch (error) {
        console.error("Explain ask error:", error);
        const body = { error: "Error answering question" };
        if (process.env.NODE_ENV !== "production") {
            body.detail = error?.message;
        }
        res.status(500).json(body);
    }
});

export default router;
