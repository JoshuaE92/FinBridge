import express from "express";
import { getFinancialAdvice } from "../services/geminiService.js";
import { getFinancialContext } from "../services/plaidService.js";
import { getDocumentContext } from "../services/documentStore.js";

const router = express.Router();

// Assemble what the agent "knows" about the user: their saved documents plus
// their linked bank balances. Both are best-effort and may be empty.
async function buildUserContext(userId) {
    const [docContext, finance] = await Promise.all([
        userId ? getDocumentContext(userId) : Promise.resolve(""),
        getFinancialContext(),
    ]);

    const parts = [];
    if (docContext) parts.push(`Documents the user has uploaded:\n${docContext}`);
    if (finance) {
        parts.push(
            `Bank balances (${finance.currency}): cash available ${finance.cashAvailable}, ` +
                `checking ${finance.checkingBalance}, savings ${finance.savingsBalance}, ` +
                `net worth ${finance.netWorth}.`
        );
    }
    return parts.join("\n\n");
}

router.post("/", async (req, res) => {
    try {
        const { message, language, culture, userId } = req.body || {};

        if (!message || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({ error: "A message is required." });
        }

        const userContext = await buildUserContext(userId);

        // Gemini is multilingual, so it answers directly in the requested
        // language — no separate translation service needed.
        const reply = await getFinancialAdvice({
            message: message.trim(),
            language: language || "en",
            culture: culture || "American",
            userContext,
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
