import "dotenv/config";
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
  return Client.forTestnet().setOperator(
    accountId,
    operatorKey,
  );
}

async function buildEnterpriseAgent() {
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

async function main() {
  const agent = await buildEnterpriseAgent();
  const command = process.argv.slice(2).join(" ").trim();

  if (!command) {
    console.log(
      "Usage: npm run start -- \"Run KYC for Acme, draft invoice, transfer 5 HBAR to 0.0.1234, then log audit message on topic\"",
    );
    process.exit(0);
  }

  const response = await agent.invoke({
    messages: [{ role: "user", content: command }],
  });

  const last = response.messages[response.messages.length - 1];
  console.log(typeof last.content === "string" ? last.content : JSON.stringify(last.content, null, 2));
}

main().catch((error) => {
  console.error("Agent execution failed:", error);
  process.exit(1);
});
