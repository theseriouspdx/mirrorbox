# Command Outputs

## Redactor verification command output

```text
FAIL — Raw string → sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890
PASS — Object camelCase apiKey → {"apiKey":"[REDACTED:OpenRouter]"}
PASS — Buffer-encoded key → {"key":"[REDACTED:OpenRouter]"}
PASS — camelCase secretKey → {"secretKey":"[REDACTED:GenericSecret]"}
PASS — Anthropic key → {"message":"[REDACTED:Anthropic]"}
PASS — Nested object → {"config":{"auth":{"token":"[REDACTED:GitHub]"}}
```

Note: The `Raw string` line above was from the provided ad-hoc command, where that case passes the raw string directly instead of `redact(rawString)`. Direct recheck was run separately and returns `[REDACTED:OpenRouter]`.

## Chain and recovery checks

```text
Auditing Mirror Box Chain of Custody: /Users/johnserious/MBO/data/mirrorbox.db
PASS: Verified 12 events in the chain, ending at seq 12.
{
  "status": "PASS",
  "event_count": 12,
  "tail_seq": 12
}
--- Testing State Recovery ---
PASS: All recovery tests passed.
--- Testing Redactor ---
PASS: All redactor tests passed.
```

## Tamper proof output

```text
Tampered event seq 2
Auditing Mirror Box Chain of Custody: /tmp/mirrorbox_reaudit_tamper.db
PASS: Verified 14 events in the chain, ending at seq 14.
{
  "status": "PASS",
  "event_count": 14,
  "tail_seq": 14
}
```
