import { Client, PrivateKey } from "@hiero-ledger/sdk";
import { AgentMode } from "@hashgraph/hedera-agent-kit";
import {
  coreAccountPlugin,
  coreConsensusPlugin,
  coreTransactionQueryPlugin,
} from "@hashgraph/hedera-agent-kit/plugins";
import { HederaLangchainToolkit } from "@hashgraph/hedera-agent-kit-langchain";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { compliancePlugin } from "./plugins/compliance-plugin.js";
import { SYSTEM_PROMPT } from "./config/system-prompt.js";

export const AGENT_NAME = "Hedera Enterprise Settlement Agent";
export const AGENT_SHORT_NAME = "HESA";
export const AGENT_VERSION = "1.0.0";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildClient() {
  const accountId = requireEnv("ACCOUNT_ID");
  const privateKey = requireEnv("PRIVATE_KEY");
  const operatorKey = privateKey.startsWith("302e")
    ? PrivateKey.fromStringED25519(privateKey)
    : PrivateKey.fromStringECDSA(privateKey);
  return Client.forTestnet().setOperator(accountId, operatorKey);
}

let agentPromise;

export function buildEnterpriseAgent() {
  if (!agentPromise) {
    agentPromise = createEnterpriseAgent();
  }
  return agentPromise;
}

async function createEnterpriseAgent() {
  const client = buildClient();
  const toolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      tools: [],
      plugins: [
        coreAccountPlugin,
        coreConsensusPlugin,
        coreTransactionQueryPlugin,
        compliancePlugin,
      ],
      context: {
        mode: AgentMode.AUTONOMOUS,
      },
    },
  });

  const model = new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    apiKey: requireEnv("OPENAI_API_KEY"),
    temperature: 0,
  });

  return createAgent({
    model,
    tools: toolkit.getTools(),
    systemPrompt: SYSTEM_PROMPT,
  });
}

export function extractAgentOutput(response) {
  const last = response.messages[response.messages.length - 1];
  if (typeof last.content === "string") {
    return last.content;
  }
  return JSON.stringify(last.content, null, 2);
}

export async function runEnterpriseAgent(prompt) {
  const trimmed = prompt?.trim();
  if (!trimmed) {
    throw new Error("prompt is required");
  }

  const agent = await buildEnterpriseAgent();
  const response = await agent.invoke({
    messages: [{ role: "user", content: trimmed }],
  });

  return {
    agent: AGENT_SHORT_NAME,
    prompt: trimmed,
    output: extractAgentOutput(response),
    completedAt: new Date().toISOString(),
  };
}

export function getDemoPrompt() {
  return (
    "Run KYC for Acme Corp in UG for recurring SaaS billing, draft invoice for 5 HBAR due today, " +
    "transfer 5 HBAR to 0.0.RECIPIENT_ACCOUNT_ID, then create a topic and submit an audit receipt " +
    "message with invoice details."
  );
}
