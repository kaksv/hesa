# HESA hosted demo guide

Use this guide to deploy **Hedera Enterprise Settlement Agent (HESA)** and produce a judge-ready live URL.

## 1) Deploy (Railway recommended)

1. Push this repo to GitHub (public).
2. Open [Railway](https://railway.app/) → **New Project** → **Deploy from GitHub repo**.
3. Select this repository.
4. Railway detects `Dockerfile` via `railway.toml`.
5. Add environment variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `ACCOUNT_ID` | Yes | Hedera testnet operator account |
| `PRIVATE_KEY` | Yes | Operator private key |
| `OPENAI_API_KEY` | Yes | LLM provider key |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` |
| `DEMO_AUTH_REQUIRED` | No (Optional) | Set to `true` to require API key auth on `/run` |
| `DEMO_API_KEY` | No (Optional) | Used only when `DEMO_AUTH_REQUIRED=true` |
| `PUBLIC_BASE_URL` | Recommended | Your public URL (e.g. `https://hesa.up.railway.app`) |

6. Deploy and copy the public domain Railway assigns.
7. Set `PUBLIC_BASE_URL` to that domain and redeploy once.

Alternative: deploy with Render using `render.yaml`.

## 2) Verify endpoints

Replace `https://YOUR-HOST` with your deployed URL.

```bash
curl https://YOUR-HOST/health
```

Expected:

```json
{ "status": "ok", "agent": "HESA", "version": "1.0.0", "network": "hedera-testnet" }
```

```bash
curl https://YOUR-HOST/demo
```

This returns a ready-made demo prompt and curl example.

Open browser demo UI:

```bash
open https://YOUR-HOST/docs
```

The `/docs` page lets judges run the workflow directly from browser.

## 3) Run the enterprise workflow (submission demo)

Replace recipient account ID with a real testnet account you control.

```bash
curl -X POST "https://YOUR-HOST/run" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Run KYC for Acme Corp in UG for recurring SaaS billing, draft invoice for 5 HBAR due today, transfer 1 HBAR to 0.0.RECIPIENT_ACCOUNT_ID, then create a topic and submit an audit receipt message with invoice details."
  }'
```

If you enabled auth (`DEMO_AUTH_REQUIRED=true`), include:

```bash
-H "Authorization: Bearer YOUR_DEMO_API_KEY"
```

### What judges should see in output

1. **Custom plugin**: `KYC_REVIEW_TOOL` decision (`APPROVED` or `REVIEW_REQUIRED`)
2. **Custom plugin**: `INVOICE_DRAFT_TOOL` invoice payload
3. **Hedera non-query #1**: `TRANSFER_HBAR_TOOL` settlement tx
4. **Hedera non-query #2+**: `CREATE_TOPIC_TOOL` and `SUBMIT_TOPIC_MESSAGE_TOOL` audit trail

## 4) Record your submission demo (2-4 minutes)

Suggested screen recording flow:

1. Open README + public GitHub repo.
2. Open `https://YOUR-HOST/health` in browser.
3. Run the `curl` command above in terminal.
4. Highlight each tool stage in the JSON/text response.
5. Optional: open HashScan for the returned transaction/topic IDs.

## 5) Final submission fields

- **GitHub repo URL**: your public repository
- **Live demo URL**: `https://YOUR-HOST` (keep service running 90+ days)
- **Feedback**: copy from `FEEDBACK.md` into AI Studio feedback form

Add your live URL in `README.md` under **Live demo**.
