import { useMemo, useState } from "react";

const API_BASE_DEFAULT = "https://your-railway-host.up.railway.app";
const DEMO_PROMPT =
  "Run KYC for Acme Corp in UG for recurring SaaS billing, draft invoice for 1 HBAR due today, transfer 1 HBAR to 0.0.RECIPIENT_ACCOUNT_ID, then create a topic and submit an audit receipt message with invoice details.";

const WORKFLOW_STEPS = [
  { name: "KYC Review", tool: "KYC_REVIEW_TOOL", summary: "Compliance pre-check" },
  { name: "Invoice Draft", tool: "INVOICE_DRAFT_TOOL", summary: "Commercial intent created" },
  { name: "HBAR Transfer", tool: "TRANSFER_HBAR_TOOL", summary: "Settlement transaction" },
  { name: "Audit Topic", tool: "CREATE_TOPIC_TOOL", summary: "Immutable audit stream opened" },
  { name: "Audit Receipt", tool: "SUBMIT_TOPIC_MESSAGE_TOOL", summary: "Receipt written on HCS" },
];

function parseToolTimeline(outputText) {
  const text = String(outputText ?? "");
  const upper = text.toUpperCase();
  const checks = {
    KYC_REVIEW_TOOL:
      /KYC STATUS|KYC REVIEW/.test(upper) || /APPROVED|REVIEW_REQUIRED/.test(upper),
    INVOICE_DRAFT_TOOL:
      /INVOICE ID|INVOICE DRAFT/.test(upper) || /INV-\d+/i.test(text),
    TRANSFER_HBAR_TOOL:
      /TRANSFER STATUS|TRANSFERRED|FAILED TO TRANSFER|TRANSFER_HBAR_TOOL/.test(upper),
    CREATE_TOPIC_TOOL:
      /TOPIC CREATED|CREATE_TOPIC_TOOL|TOPIC WITH ID|TOPIC ID/.test(upper),
    SUBMIT_TOPIC_MESSAGE_TOOL:
      /AUDIT RECEIPT MESSAGE SUBMITTED|SUBMIT_TOPIC_MESSAGE_TOOL|AUDIT RECEIPT/.test(upper),
  };

  const transferFailed = /FAILED TO TRANSFER|INVALID_ACCOUNT_ID|INSUFFICIENT|NOT_FOUND/.test(
    upper,
  );

  return WORKFLOW_STEPS.map((step) => {
    const detected = checks[step.tool];
    if (!detected) {
      return { ...step, status: "pending" };
    }
    if (step.tool === "TRANSFER_HBAR_TOOL" && transferFailed) {
      return { ...step, status: "failed" };
    }
    return { ...step, status: "completed" };
  });
}

function extractEntities(outputText) {
  const text = String(outputText ?? "");
  const invoiceId =
    text.match(/INV-\d+/i)?.[0] ??
    text.match(/Invoice ID\**:\**\s*([^\n]+)/i)?.[1]?.trim() ??
    "Not detected";
  const topicId =
    text
      .match(/\b0\.0\.\d+\b(?=.*topic)|topic.*\b0\.0\.\d+\b/i)?.[0]
      ?.match(/\b0\.0\.\d+\b/)?.[0] ?? "Not detected";
  const accounts = Array.from(new Set(text.match(/\b0\.0\.\d+\b/g) ?? [])).slice(0, 4);
  const upper = text.toUpperCase();
  const kycStatus = upper.includes("REVIEW_REQUIRED")
    ? "REVIEW_REQUIRED"
    : upper.includes("APPROVED")
      ? "APPROVED"
      : "Not detected";
  const transferSeen =
    /TRANSFER STATUS|TRANSFERRED|FAILED TO TRANSFER|TRANSFER_HBAR_TOOL/.test(upper);
  const topicSeen =
    /TOPIC CREATED|CREATE_TOPIC_TOOL|TOPIC WITH ID|TOPIC ID/.test(upper) ||
    topicId !== "Not detected";

  return { invoiceId, topicId, accounts, kycStatus, transferSeen, topicSeen };
}

function StatusPill({ label, tone = "neutral" }) {
  const tones = {
    success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
    warning: "border-amber-500/40 bg-amber-500/15 text-amber-200",
    neutral: "border-slate-600 bg-slate-800 text-slate-200",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {label}
    </span>
  );
}

function HashScanLink({ id, type }) {
  const path = type === "topic" ? "topic" : "account";
  const href = `https://hashscan.io/testnet/${path}/${id}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-10 items-center rounded-lg border border-cyan-700/40 bg-cyan-900/20 px-3 py-2 text-xs font-medium text-cyan-100 transition hover:border-cyan-500 hover:bg-cyan-800/30 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      {type === "topic" ? "Topic" : "Account"}: {id}
    </a>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [apiBaseUrl, setApiBaseUrl] = useState(
    import.meta.env.VITE_HESA_API_URL ?? API_BASE_DEFAULT,
  );
  const [demoApiKey, setDemoApiKey] = useState("");
  const [prompt, setPrompt] = useState(DEMO_PROMPT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState(null);
  const [copied, setCopied] = useState("");

  const timeline = useMemo(
    () => parseToolTimeline(response?.output ?? ""),
    [response?.output],
  );
  const entities = useMemo(
    () => extractEntities(response?.output ?? ""),
    [response?.output],
  );
  const embedInstallSnippet = "npm install @hesa/client";
  const embedCodeSnippet = `import { createHesaClient } from "@hesa/client";

const hesa = createHesaClient({
  baseUrl: "${apiBaseUrl || "https://hesa-agent-production.up.railway.app"}",
});

const result = await hesa.run({
  prompt: "Run KYC for Acme Corp in UG, draft invoice for 1 HBAR due today, transfer 1 HBAR to 0.0.RECIPIENT_ACCOUNT_ID, then create a topic and submit an audit receipt message with invoice details.",
});

console.log(result);`;
  const embedCurlSnippet = `curl -X POST "${(apiBaseUrl || "https://hesa-agent-production.up.railway.app").replace(/\/$/, "")}/run" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"Run KYC for Acme Corp in UG, draft invoice for 1 HBAR due today, transfer 1 HBAR to 0.0.RECIPIENT_ACCOUNT_ID, then create a topic and submit an audit receipt message with invoice details."}'`;

  async function copyToClipboard(label, value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  }

  async function runAgent() {
    setLoading(true);
    setError("");
    setResponse(null);

    try {
      const headers = { "Content-Type": "application/json" };
      if (demoApiKey.trim()) {
        headers.Authorization = `Bearer ${demoApiKey.trim()}`;
      }

      const runUrl = `${apiBaseUrl.replace(/\/$/, "")}/run`;
      const result = await fetch(runUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt }),
      });
      const data = await result.json();

      if (!result.ok) {
        throw new Error(data?.message ?? data?.error ?? "Request failed");
      }

      setResponse(data);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6">
        <header className="rounded-3xl border border-cyan-900/60 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/50 p-6 shadow-[0_0_0_1px_rgba(8,47,73,0.2)]">
          <p className="text-xs font-semibold tracking-[0.2em] text-cyan-300">HESA</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
            Hedera Enterprise Settlement Agent
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
            Enterprise workflow automation on Hedera with a production-style flow: KYC,
            invoice drafting, settlement, and immutable audit receipts.
          </p>
        </header>

        <div className="inline-flex w-full rounded-xl border border-slate-800 bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`min-h-10 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === "overview"
                ? "bg-cyan-400 text-slate-950"
                : "text-slate-300 hover:bg-slate-800"
            } focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950`}
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("try")}
            className={`min-h-10 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === "try"
                ? "bg-cyan-400 text-slate-950"
                : "text-slate-300 hover:bg-slate-800"
            } focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950`}
          >
            Try HESA
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("embed")}
            className={`min-h-10 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === "embed"
                ? "bg-cyan-400 text-slate-950"
                : "text-slate-300 hover:bg-slate-800"
            } focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950`}
          >
            Embed
          </button>
        </div>

        {activeTab === "overview" ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold">Visual Workflow</h2>
            <p className="mt-2 text-sm text-slate-300">
              This sequence models an enterprise payment operation from pre-check to final
              on-chain audit.
            </p>
            <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {WORKFLOW_STEPS.map((step, index) => (
                <li
                  key={step.tool}
                  className="relative rounded-2xl border border-slate-700 bg-slate-900/80 p-4 transition hover:-translate-y-0.5 hover:border-cyan-600/40"
                >
                  <p className="text-xs text-cyan-300">Step {index + 1}</p>
                  <p className="mt-1 font-semibold">{step.name}</p>
                  <p className="mt-1 text-sm text-slate-300">{step.summary}</p>
                  <p className="mt-3 rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200">
                    {step.tool}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ) : activeTab === "try" ? (
          <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <h2 className="text-xl font-semibold">Run Agent</h2>
              <p className="mt-2 text-sm text-slate-300">
                Point this UI to your Railway deployment and execute a live workflow.
              </p>

              <label className="mt-5 block text-sm font-medium" htmlFor="api-url">
                API Base URL
              </label>
              <input
                id="api-url"
                className="mt-2 min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-300"
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                placeholder="https://your-railway-host.up.railway.app"
                autoComplete="url"
              />

              <label className="mt-4 block text-sm font-medium" htmlFor="demo-key">
                DEMO_API_KEY (optional)
              </label>
              <input
                id="demo-key"
                className="mt-2 min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-300"
                value={demoApiKey}
                onChange={(event) => setDemoApiKey(event.target.value)}
                placeholder="Only if your server enforces auth"
                type="password"
                autoComplete="off"
              />

              <label className="mt-4 block text-sm font-medium" htmlFor="prompt">
                Prompt
              </label>
              <div className="mt-2 rounded-lg border border-amber-600/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-100">
                Reminder: replace placeholder account values (for example
                <code className="mx-1 rounded bg-amber-950/60 px-1.5 py-0.5">0.0.RECIPIENT_ACCOUNT_ID</code>)
                with a real Hedera testnet <code className="mx-1 rounded bg-amber-950/60 px-1.5 py-0.5">ACCOUNT_ID</code>
                you control.
              </div>
              <textarea
                id="prompt"
                className="mt-2 min-h-36 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-300"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />

              <button
                type="button"
                onClick={runAgent}
                disabled={loading || !apiBaseUrl.trim() || !prompt.trim()}
                className="mt-4 min-h-10 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                {loading ? "Running..." : "Run Workflow"}
              </button>

              {error ? (
                <div className="mt-4 rounded-lg border border-rose-700/60 bg-rose-900/30 p-3 text-sm text-rose-200">
                  <p className="font-semibold">Run failed</p>
                  <p className="mt-1">{error}</p>
                </div>
              ) : null}
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                <h3 className="text-lg font-semibold">Execution Summary</h3>
                {!response && !loading && !error ? (
                  <p className="mt-3 text-sm text-slate-400">
                    No run yet. Execute a workflow to view execution cards.
                  </p>
                ) : null}
                {loading ? (
                  <p className="mt-3 text-sm text-slate-300">Executing on Hedera testnet...</p>
                ) : null}
                {response ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <article className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                        <p className="text-xs text-slate-400">KYC Status</p>
                        <div className="mt-2">
                          <StatusPill
                            label={entities.kycStatus}
                            tone={
                              entities.kycStatus === "APPROVED"
                                ? "success"
                                : entities.kycStatus === "REVIEW_REQUIRED"
                                  ? "warning"
                                  : "neutral"
                            }
                          />
                        </div>
                      </article>
                      <article className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                        <p className="text-xs text-slate-400">Invoice</p>
                        <p className="mt-2 text-sm font-medium">{entities.invoiceId}</p>
                      </article>
                      <article className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                        <p className="text-xs text-slate-400">Settlement</p>
                        <div className="mt-2">
                          <StatusPill
                            label={entities.transferSeen ? "Transfer Detected" : "Pending"}
                            tone={entities.transferSeen ? "success" : "neutral"}
                          />
                        </div>
                      </article>
                      <article className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                        <p className="text-xs text-slate-400">Audit Topic</p>
                        <p className="mt-2 text-sm font-medium">{entities.topicId}</p>
                      </article>
                    </div>

                    <article className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                      <p className="text-xs text-slate-400">Detected Hedera IDs</p>
                      {entities.accounts.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entities.accounts.map((id) => (
                            <span
                              key={id}
                              className="rounded-full border border-cyan-700/40 bg-cyan-900/20 px-2.5 py-1 text-xs"
                            >
                              {id}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-400">No account IDs detected yet.</p>
                      )}
                    </article>

                    <article className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                      <h4 className="text-sm font-semibold">Workflow Timeline</h4>
                      <ul className="mt-3 space-y-2">
                        {timeline.map((step) => (
                          <li
                            key={step.tool}
                            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                              step.status === "completed"
                                ? "border-emerald-600/60 bg-emerald-900/30 text-emerald-200"
                                : step.status === "failed"
                                  ? "border-amber-600/60 bg-amber-900/30 text-amber-200"
                                : "border-slate-700 bg-slate-900 text-slate-300"
                            }`}
                          >
                            <span>{step.name}</span>
                            <span className="text-xs">{step.status}</span>
                          </li>
                        ))}
                      </ul>
                    </article>

                    <article className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                      <h4 className="text-sm font-semibold">HashScan Links</h4>
                      <p className="mt-1 text-xs text-slate-400">
                        Click to verify accounts/topics on Hedera Testnet explorer.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entities.accounts.map((id) => (
                          <HashScanLink key={`account-${id}`} id={id} type="account" />
                        ))}
                        {entities.topicSeen && entities.topicId !== "Not detected" ? (
                          <HashScanLink id={entities.topicId} type="topic" />
                        ) : null}
                        {!entities.accounts.length &&
                        !(entities.topicSeen && entities.topicId !== "Not detected") ? (
                          <p className="text-sm text-slate-400">
                            No linkable IDs detected yet.
                          </p>
                        ) : null}
                      </div>
                    </article>

                    <details className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                      <summary className="cursor-pointer text-sm font-semibold">
                        Raw Response (expand)
                      </summary>
                      <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
                        {JSON.stringify(response, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
              <h2 className="text-xl font-semibold">Embed HESA in Any JS App</h2>
              <p className="mt-2 text-sm text-slate-300">
                Use the tiny client wrapper for one-import integration. Good for web apps,
                internal tools, bots, and backend workflows.
              </p>

              <article className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">1) Install client</h3>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("install", embedInstallSnippet)}
                    className="min-h-10 rounded-lg border border-slate-600 px-3 text-xs font-semibold text-slate-200 transition hover:border-cyan-500 hover:text-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    Copy
                  </button>
                </div>
                <pre className="mt-3 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
                  {embedInstallSnippet}
                </pre>
              </article>

              <article className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">2) Use in code</h3>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("sdk", embedCodeSnippet)}
                    className="min-h-10 rounded-lg border border-slate-600 px-3 text-xs font-semibold text-slate-200 transition hover:border-cyan-500 hover:text-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    Copy
                  </button>
                </div>
                <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
                  {embedCodeSnippet}
                </pre>
              </article>

              <article className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">3) Optional raw HTTP</h3>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("curl", embedCurlSnippet)}
                    className="min-h-10 rounded-lg border border-slate-600 px-3 text-xs font-semibold text-slate-200 transition hover:border-cyan-500 hover:text-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    Copy
                  </button>
                </div>
                <pre className="mt-3 max-h-52 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
                  {embedCurlSnippet}
                </pre>
              </article>

              {copied ? (
                <p className="mt-3 text-sm text-emerald-300">Copied {copied} snippet.</p>
              ) : null}
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                <h3 className="text-lg font-semibold">Integration Notes</h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-300">
                  <li className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                    Client defaults to JSON over HTTP with a single `run()` call.
                  </li>
                  <li className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                    If backend auth is enabled, pass `apiKey` in client config.
                  </li>
                  <li className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                    Works in browser and Node.js runtimes.
                  </li>
                </ul>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                <h3 className="text-lg font-semibold">Package Location</h3>
                <p className="mt-2 text-sm text-slate-300">
                  This repo includes a publish-ready package at
                  <code className="ml-1 rounded bg-slate-800 px-1.5 py-0.5">packages/hesa-client</code>.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default App;
