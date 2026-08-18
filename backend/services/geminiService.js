import { GoogleGenAI, Type } from "@google/genai";
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

function homeCountryFraming(culture) {
    const cultureData = culturalContext[culture] || {};
    return Object.keys(cultureData).length
        ? `The user's background is ${culture}. Their values: ${cultureData.values}. ` +
              `When helpful, relate US concepts to what someone from a ${culture} background ` +
              `would already know from home.`
        : `Relate US financial concepts to what a newcomer might know from their home country.`;
}

// "Explain This": takes a document image and/or a typed question and returns a
// structured, plain-language explanation in the user's language, framed for an
// immigrant new to the US financial system, with concrete actions + red flags.
export async function explainDocument({
    imageBase64,
    mimeType,
    question,
    language,
    culture,
    financialContext,
}) {
    const languageName = resolveLanguage(language);

    const financeBlock = financialContext
        ? `
    The user has linked their bank. Their real balances (${financialContext.currency}):
    cash available ${financialContext.cashAvailable}, checking ${financialContext.checkingBalance},
    savings ${financialContext.savingsBalance}, net worth ${financialContext.netWorth}.
    In personalConnection, explain concretely how THIS document affects THEIR money
    (e.g. what share of their available cash an amount represents, whether they can cover
    it, which account to use). Use their real numbers. If not relevant, return "".`
        : `No bank is linked, so leave personalConnection as an empty string.`;

    const annotationBlock = imageBase64
        ? `
    Since a document IMAGE is provided, also return "annotations": for the most important
    regions (the amount due, due date, fees, account/policy numbers, signature lines),
    give a short note and a bounding "box" as [ymin, xmin, ymax, xmax] using integers
    normalized 0-1000 relative to the image. Include only boxes you are confident about
    (max 6). If it is a PDF or you cannot locate regions, return an empty array.`
        : `No image is provided, so return an empty "annotations" array.`;

    const instruction = `
    You are FinBridge, helping an immigrant understand the US financial system.
    ${homeCountryFraming(culture)}
    Respond ENTIRELY in ${languageName}, in simple, non-judgmental language.
    You are given a document image and/or a question. Explain what it is and what it
    means for the user. Pull out concrete key details (amounts, dates, parties, rates).
    Give clear next steps. If you see anything predatory, high-fee, a scam, or a
    deadline that could hurt them, list it in redFlags (otherwise return an empty array).
    In homeCountryNote, relate it to the user's home-country experience.
    ${financeBlock}
    ${annotationBlock}
    ${question ? `The user's question: ${question}` : "The user did not type a question; explain the document."}
    `;

    const parts = [{ text: instruction }];
    if (imageBase64) {
        parts.push({
            inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 },
        });
    }

    try {
        const result = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: [{ role: "user", parts }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        summary: { type: Type.STRING },
                        keyDetails: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    label: { type: Type.STRING },
                                    value: { type: Type.STRING },
                                },
                                required: ["label", "value"],
                            },
                        },
                        actions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        redFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
                        homeCountryNote: { type: Type.STRING },
                        personalConnection: { type: Type.STRING },
                        annotations: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    note: { type: Type.STRING },
                                    box: {
                                        type: Type.ARRAY,
                                        items: { type: Type.NUMBER },
                                    },
                                },
                                required: ["note", "box"],
                            },
                        },
                    },
                    required: ["title", "summary", "actions"],
                },
            },
        });

        return JSON.parse(result.text);
    } catch (error) {
        console.error("Gemini explain error:", error);
        throw new Error(error?.message || "Error explaining document");
    }
}

// Follow-up Q&A about an already-uploaded document. Re-sends the document image
// so answers stay grounded in what's actually on the page.
export async function answerDocumentQuestion({
    imageBase64,
    mimeType,
    question,
    language,
    culture,
    financialContext,
}) {
    const languageName = resolveLanguage(language);

    const financeLine = financialContext
        ? `The user's real balances (${financialContext.currency}): cash available ` +
          `${financialContext.cashAvailable}, checking ${financialContext.checkingBalance}, ` +
          `savings ${financialContext.savingsBalance}, net worth ${financialContext.netWorth}. ` +
          `Use these if the question is about how the document affects their money.`
        : "";

    const instruction = `
    You are FinBridge, helping an immigrant understand a US financial document.
    ${homeCountryFraming(culture)}
    Answer ENTIRELY in ${languageName}, in simple, plain language, in a few sentences.
    Answer the user's question using the attached document. If the answer is not in the
    document, be honest and say what you can. ${financeLine}
    Question: ${question}
    `;

    const parts = [{ text: instruction }];
    if (imageBase64) {
        parts.push({
            inlineData: { mimeType: mimeType || "image/png", data: imageBase64 },
        });
    }

    try {
        const result = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: [{ role: "user", parts }],
        });
        const text =
            result.text ||
            result?.candidates?.[0]?.content?.parts?.[0]?.text ||
            "Sorry, I couldn't answer that.";
        return text.trim();
    } catch (error) {
        console.error("Gemini answerDocumentQuestion error:", error);
        throw new Error(error?.message || "Error answering question");
    }
}

// "Credit Roadmap": turns Plaid-derived credit signals into a prioritized,
// culturally-framed set of best next moves for building US credit from zero.
export async function getCreditRoadmap({ signals, language, culture }) {
    const languageName = resolveLanguage(language);

    const instruction = `
    You are FinBridge, coaching an immigrant on building US credit from scratch.
    ${homeCountryFraming(culture)}
    Respond ENTIRELY in ${languageName}, encouraging and concrete.
    These are the user's real financial signals (NOT a credit score — you do not have one):
    ${JSON.stringify(signals)}
    Give an honest one-line "standing" summary, then a prioritized list of the best next
    moves to build credit (secured cards, credit-builder loans, autopay, keeping
    utilization low, never missing payments). For each move give a short "why".
    In explanation, briefly explain what a US credit score is and why it matters here.
    `;

    try {
        const result = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: instruction,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        standing: { type: Type.STRING },
                        moves: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    why: { type: Type.STRING },
                                    priority: { type: Type.STRING },
                                },
                                required: ["title", "why"],
                            },
                        },
                        explanation: { type: Type.STRING },
                    },
                    required: ["standing", "moves", "explanation"],
                },
            },
        });

        return JSON.parse(result.text);
    } catch (error) {
        console.error("Gemini credit roadmap error:", error);
        throw new Error(error?.message || "Error generating credit roadmap");
    }
}
