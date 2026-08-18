import "dotenv/config";
import express from "express";
import cors from "cors";
import adviceRoutes from "./routes/advice.js";
import userRoutes from "./routes/user.js";
import transactionRoutes from "./routes/transactions.js";
import translateRoutes from "./routes/translate.js";
import plaidRoutes from "./routes/plaid.js";
import explainRoutes from "./routes/explain.js";

const app = express();
app.use(cors());

// Raised limit so base64 document images fit in the JSON body.
app.use(express.json({ limit: "12mb" }));
app.use("/api/advice", adviceRoutes);
app.use("/api/user", userRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/translate", translateRoutes);
app.use("/api/plaid", plaidRoutes);
app.use("/api/explain", explainRoutes);

app.get("/", (req, res) => {
    res.send("FinBridge backend is running.");
})

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));