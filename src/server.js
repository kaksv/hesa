import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  AGENT_NAME,
  AGENT_SHORT_NAME,
  AGENT_VERSION,
  getDemoPrompt,
  runEnterpriseAgent,
} from "./agent.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json({ limit: "32kb" }));

function unauthorized(res) {
  return res.status(401).json({
    error: "Unauthorized",
    hint: "Set Authorization: Bearer <DEMO_API_KEY> when DEMO_API_KEY is configured",
  });
}

function checkApiKey(req, res) {
  const expected = process.env.DEMO_API_KEY?.trim();
  if (!expected) {
    return true;
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
      run: "POST /run",
      demo: "GET /demo",
    },
    demoPrompt: getDemoPrompt(),
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agent: AGENT_SHORT_NAME,
    version: AGENT_VERSION,
    network: "hedera-testnet",
  });
});

app.get("/demo", (_req, res) => {
  res.json({
    description: "Example settlement workflow for hackathon judges",
    method: "POST",
    path: "/run",
    body: { prompt: getDemoPrompt() },
    curl: `curl -X POST "${
      process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`
    }/run" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $DEMO_API_KEY" \\
  -d '${JSON.stringify({ prompt: getDemoPrompt() })}'`,
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
  console.log(`Demo:   http://localhost:${port}/demo`);
});
