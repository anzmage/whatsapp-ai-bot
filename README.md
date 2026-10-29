# whatsapp-ai-bot

A small personal bot: it receives WhatsApp messages through [Baileys](https://github.com/WhiskeySockets/Baileys),
asks an OpenAI-compatible LLM for an answer, and sends it back.

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
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Any OpenAI-compatible endpoint. Defaults to DeepSeek. |
| `SYSTEM_PROMPT` | Persona and style of the bot. |
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
- Message text is sent to the LLM provider.

## Tests

`npm test` covers the allowlist, rate limiter and history (not a live WhatsApp connection).

License: MIT.
