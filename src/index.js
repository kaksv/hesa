import "dotenv/config";
import { getDemoPrompt, runEnterpriseAgent } from "./agent.js";

async function main() {
  const command = process.argv.slice(2).join(" ").trim();

  if (!command) {
    console.log(
      `Usage: npm run cli -- "${getDemoPrompt()}"`,
    );
    console.log("\nHosted API: npm run start");
    process.exit(0);
  }

  const result = await runEnterpriseAgent(command);
  console.log(result.output);
}

main().catch((error) => {
  console.error("Agent execution failed:", error);
  process.exit(1);
});
