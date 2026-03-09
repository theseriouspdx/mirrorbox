const SECRET_PATTERNS = [
  { name: 'OpenRouter', regex: /(sk-or-v1-[a-zA-Z0-9]{32,})/g },
  { name: 'GitHub', regex: /(ghp_[a-zA-Z0-9]{36})/g },
  { name: 'OpenAI', regex: /(sk-[a-zA-Z0-9]{48})/g },
  { name: 'Slack', regex: /(xox[baprs]-[a-zA-Z0-9-]{10,})/g },
  { name: 'GenericSecret', regex: /"?(?:api_key|secret|token|password|bearer)"?\s*[:=]\s*"?([a-zA-Z0-9\-_\.]{8,})"?/gi }
];

/**
 * Redacts known secret signatures from a string or object.
 * Satisfies Invariant 8: Secrets never enter the persistent state.
 */
function redact(input) {
  if (input === null || input === undefined) return input;
  
  const isObject = typeof input === 'object';
  let content = isObject ? JSON.stringify(input) : String(input);

  SECRET_PATTERNS.forEach(({ name, regex }) => {
    content = content.replace(regex, (match, group1) => {
      // If it's a key-value pair regex, only redact the value (group1)
      if (group1) {
        return match.replace(group1, `[REDACTED:${name}]`);
      }
      return `[REDACTED:${name}]`;
    });
  });

  return isObject ? JSON.parse(content) : content;
}

module.exports = { redact };
