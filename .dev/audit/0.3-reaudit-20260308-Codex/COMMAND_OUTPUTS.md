# Command Outputs

## Redactor verification (prompt-provided command)

```text
FAIL — Raw string → sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890
PASS — Object camelCase apiKey → {"apiKey":"[REDACTED:OpenRouter]"}
PASS — Buffer-encoded key → {"key":"[REDACTED:OpenRouter]"}
PASS — camelCase secretKey → {"secretKey":"[REDACTED:GenericSecret]"}
PASS — Anthropic key → {"message":"[REDACTED:Anthropic]"}
PASS — Nested object → {"config":{"auth":{"token":"[REDACTED:GitHub]"}}
```

Note: the prompt command's `Raw string` case does not call `redact(...)`; direct redactor test below confirms raw-string redaction works.

## Direct redactor test suite

```text
[PASS] Raw string OpenRouter
[PASS] Object camelCase apiKey
[PASS] Buffer-encoded OpenRouter
[PASS] camelCase secretKey
[PASS] snake_case api_key
[PASS] Anthropic unlabeled

All redaction tests passed.
```

## Baseline verifiers + recovery

```text
Auditing Mirror Box Chain of Custody: /Users/johnserious/MBO/data/mirrorbox.db
PASS: Verified 5 events in the chain, ending at seq 5.
Auditing Mirror Box Chain of Custody: /Users/johnserious/MBO/scripts/../data/mirrorbox.db
PASS: Verified 5 events in the chain, ending at seq 5.
--- Testing State Recovery ---
PASS: All recovery tests passed.
```

## Tamper proof (non-tail payload changed; only tampered row hash recomputed)

```text
Tampered event seq 2
Auditing Mirror Box Chain of Custody: /tmp/mirrorbox_reaudit_tamper2.db
FAIL [Chain Breach]: Event ... (seq 3) refers to prev_hash ..., expected ...
FAILED: 1 integrity errors found.
Auditing Mirror Box Chain of Custody: /tmp/mirrorbox_reaudit_tamper2.db
FAIL [Chain Breach]: Event ... (seq 3) refers to prev_hash ..., expected ...
FAILED: 1 integrity errors found.
```
