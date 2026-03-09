const SECRET_PATTERNS = [
  { name: 'OpenRouter', regex: /sk-or-v1-[a-zA-Z0-9]{32,}/g },
  { name: 'Anthropic', regex: /sk-ant-api03-[a-zA-Z0-9]{40,90}/g },
  { name: 'GitHub', regex: /ghp_[a-zA-Z0-9]{36}/g },
  { name: 'OpenAI', regex: /sk-[a-zA-Z0-9]{48}/g },
  { name: 'Slack', regex: /xox[baprs]-[a-zA-Z0-9-]{10,}/g },
  { name: 'GenericSecret', regex: /"?(?:api_key|secret|token|password|bearer|apikey|secretkey|authtoken|auth_token)"?\s*[:=]\s*"?([a-zA-Z0-9\-_\.]{8,})"?/gi }
];

/**
 * Redacts known secret signatures from a string or object.
 * Satisfies Invariant 8: Secrets never enter the persistent state.
 */
function redact(input) {
  if (input === null || input === undefined) return input;
  
  const isObject = typeof input === 'object';
  let content;

  if (isObject) {
    // Stringify with a replacer to catch Buffers before they are mangled into byte arrays
    content = JSON.stringify(input, (key, value) => {
      if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
        return Buffer.from(value.data).toString('utf8');
      }
      return value;
    });
  } else {
    content = String(input);
  }

  SECRET_PATTERNS.forEach(({ name, regex }) => {
    // Use ...args to avoid confusion between capture groups and offsets
    content = content.replace(regex, (match, ...args) => {
      // For a regex with 1 capture group (GenericSecret), args[0] is group1
      // String.replace(regex, (match, p1, p2, ..., offset, string))
      // If the regex has 0 capture groups, args[0] is offset (a number)
      
      const p1 = args[0];
      if (typeof p1 === 'string' && p1 !== match) {
        // We have a capture group (like GenericSecret value), redact only that
        return match.replace(p1, `[REDACTED:${name}]`);
      }
      // No capture group or p1 is the match itself, redact the whole thing
      return `[REDACTED:${name}]`;
    });
  });

  return isObject ? JSON.parse(content) : content;
}

module.exports = { redact };
