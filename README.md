# whatsapp-ai-bot

A small personal bot: it receives WhatsApp messages through [Baileys](https://github.com/WhiskeySockets/Baileys),
asks an LLM for an answer, and sends it back.

By default it answers as **Zai**, the ZaidanLab assistant from zaidanlab.dev: same knowledge
(the live `llms.txt`) and the same free provider chain (Workers AI → Ollama Cloud → NVIDIA NIM →
Requesty), with DeepSeek as the paid last resort. Unlike the website chat it has no
conversation-length limit and also answers general questions.

The repo began as a fork of finereli/whatsapp-mcp, whose code has since been removed
(still in git history). Only `LICENSE` remains from it.

## Warning

Baileys is unofficial and against WhatsApp's Terms of Service. The number can be banned.
**Use a spare number**, for personal use and experiments, not customers.

## Setup

```bash
npm install
cp .env.example .env     # fill in LLM_API_KEY and ALLOWED_NUMBERS
npm start                # pairing code (or QR if BOT_NUMBER is empty): WhatsApp > Linked devices
```

Needs Node 20.6+. The session is stored in `auth/` (git-ignored); delete it to re-link.

## Configuration (`.env`)

| Variable | Meaning |
|---|---|
| `CF_ACCOUNT_ID` + `CF_API_TOKEN`, `OLLAMA_API_KEY`, `NVIDIA_API_KEY`, `REQUESTY_API_KEY` | Free providers, tried in that order; an empty key skips the provider. |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Paid last resort, any OpenAI-compatible endpoint. Defaults to DeepSeek `deepseek-flash`. |
| `KNOWLEDGE_URL` | Set = answer as Zai with this `llms.txt` as knowledge. Empty = use `SYSTEM_PROMPT`. |
| `SYSTEM_PROMPT` | Persona and style when `KNOWLEDGE_URL` is empty. |
| `BOT_NUMBER` | The number the bot runs on (digits, country code). Set = link with a pairing code instead of a QR. |
| `ALLOWED_NUMBERS` | Comma-separated numbers (digits, with country code) the bot answers. Empty = nobody, `*` = anyone. |
| `MAX_REPLIES_PER_HOUR` | Hourly cap across all chats (0 = no cap). |
| `MAX_REPLIES_PER_SENDER_PER_HOUR` | Hourly cap per sender (0 = no cap). Keeps one number from using the whole budget in `*` mode. |
| `HISTORY_TURNS` | How many past exchanges per chat are sent to the model (memory only, lost on restart). |
| `REPLY_DELAY_MIN_MS` / `REPLY_DELAY_MAX_MS` | Random "typing" delay before each reply. |

## Safety notes

- Only direct chats are answered: groups, status and your own messages are ignored.
- Senders not on `ALLOWED_NUMBERS` are logged, so you can copy their number into it.
- With `ALLOWED_NUMBERS=*` anyone can spend your LLM budget; the per-sender and hourly caps bound that.
- The bot has no tools, so a malicious message can at most change what it says, not what it does.
- Message text is sent to whichever LLM provider answers (Cloudflare, Ollama, NVIDIA, Requesty or DeepSeek).

## Tests

`npm test` covers the allowlist, rate limiter, history, reply cleaning and provider fallback (not a live WhatsApp connection or real LLM calls).

License: MIT.
