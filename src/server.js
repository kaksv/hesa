import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_NAME,
  AGENT_SHORT_NAME,
  AGENT_VERSION,
  getDemoPrompt,
  runEnterpriseAgent,
} from "./agent.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsHtmlPath = path.join(__dirname, "..", "docs", "demo.html");
const REQUIRED_RUNTIME_VARS = ["ACCOUNT_ID", "PRIVATE_KEY", "OPENAI_API_KEY"];

function isAuthRequired() {
  return String(process.env.DEMO_AUTH_REQUIRED ?? "false").toLowerCase() === "true";
}

function getEnvDiagnostics() {
  const present = Object.fromEntries(
    REQUIRED_RUNTIME_VARS.map((key) => [key, Boolean(process.env[key]?.trim())]),
  );
  const missing = REQUIRED_RUNTIME_VARS.filter((key) => !present[key]);
  return { present, missing };
}

app.use(cors());
app.use(express.json({ limit: "32kb" }));

function unauthorized(res) {
  return res.status(401).json({
    error: "Unauthorized",
    hint: "Set Authorization: Bearer <DEMO_API_KEY> when DEMO_AUTH_REQUIRED=true",
  });
}

function checkApiKey(req, res) {
  if (!isAuthRequired()) {
    return true;
  }

  const expected = process.env.DEMO_API_KEY?.trim();
  if (!expected) {
    return res.status(500).json({
      error: "Server misconfigured",
      message: "DEMO_AUTH_REQUIRED=true but DEMO_API_KEY is missing",
    });
  }

  const header = req.get("authorization");
  const bearer =
    header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
  const apiKeyHeader = req.get("x-api-key")?.trim();

  if (bearer === expected || apiKeyHeader === expected) {
    return true;
  }

  unauthorized(res);
  return false;
}

app.get("/", (_req, res) => {
  res.json({
    name: AGENT_NAME,
    shortName: AGENT_SHORT_NAME,
    version: AGENT_VERSION,
    status: "online",
    endpoints: {
      health: "GET /health",
      docs: "GET /docs",
      run: "POST /run",
      demo: "GET /demo",
    },
    demoPrompt: getDemoPrompt(),
    authRequired: isAuthRequired(),
  });
});

app.get("/health", (_req, res) => {
  const diagnostics = getEnvDiagnostics();
  res.json({
    status: "ok",
    agent: AGENT_SHORT_NAME,
    version: AGENT_VERSION,
    network: "hedera-testnet",
    env: diagnostics.present,
    ready: diagnostics.missing.length === 0,
    missing: diagnostics.missing,
    authRequired: isAuthRequired(),
  });
});

app.get("/docs", (_req, res) => {
  res.sendFile(docsHtmlPath);
});

app.get("/demo", (_req, res) => {
  res.json({
    description: "Example settlement workflow for hackathon judges",
    method: "POST",
    path: "/run",
    body: { prompt: getDemoPrompt() },
    authRequired: isAuthRequired(),
    curl: `curl -X POST "${
      process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`
    }/run" \\
  -H "Content-Type: application/json" \\
  ${isAuthRequired() ? '-H "Authorization: Bearer $DEMO_API_KEY" \\\n  ' : ""}-d '${JSON.stringify({ prompt: getDemoPrompt() })}'`,
  });
});

app.post("/run", async (req, res) => {
  if (!checkApiKey(req, res)) {
    return;
  }

  const prompt = req.body?.prompt;
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({
      error: "Invalid request",
      hint: 'Send JSON body: { "prompt": "your instruction" }',
      example: getDemoPrompt(),
    });
  }

  try {
    const result = await runEnterpriseAgent(prompt);
    return res.json(result);
  } catch (error) {
    console.error("POST /run failed:", error);
    return res.status(500).json({
      error: "Agent execution failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.listen(port, () => {
  console.log(`${AGENT_SHORT_NAME} API listening on port ${port}`);
  console.log(`Health: http://localhost:${port}/health`);
  console.log(`Docs:   http://localhost:${port}/docs`);
  console.log(`Demo:   http://localhost:${port}/demo`);
});
