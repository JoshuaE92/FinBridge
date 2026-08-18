import { GoogleGenAI } from "@google/genai";
import culturalContext from "./culturalContext.js";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

// The frontend sends short language codes; Gemini responds best to full names.
const LANGUAGE_NAMES = {
    en: "English",
    es: "Spanish",
};

function resolveLanguage(language) {
    if (!language) return "English";
    return LANGUAGE_NAMES[language] || language;
}

export async function getFinancialAdvice({ message, language, culture }) {
    const languageName = resolveLanguage(language);
    const cultureData = culturalContext[culture] || {};

    // Fold the cultural context into the prompt so the advice is actually
    // tailored to the selected culture instead of being generic.
    const culturalNotes = Object.keys(cultureData).length
        ? `
    Cultural context for a ${culture} user:
    - Common word for saving: ${cultureData.saving_term}
    - Typical saving goal: ${cultureData.example}
    - Core values: ${cultureData.values}
    - Budgeting style: ${cultureData.budgeting_style}
    - Investment attitude: ${cultureData.investment_attitude}`
        : "";

    const prompt = `
    You are FinBridge, a helpful multicultural AI financial advisor.
    Respond in ${languageName}.
    Give short, culturally relevant financial advice that fits ${culture} customs.
    Example topics: saving for family, managing expenses, smart budgeting.
    ${culturalNotes}
    Question: ${message || "How can I save more money each month?"}
    `;

    try {
        const result = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: prompt,
        });

        const text =
            result.text ||
            result?.candidates?.[0]?.content?.parts?.[0]?.text ||
            "Sorry, I couldn't generate advice right now.";

        return text.trim();
    } catch (error) {
        console.error("Gemini API error:", error);
        // Preserve the underlying message so callers can surface it in dev.
        throw new Error(error?.message || "Error generating advice");
    }
}
