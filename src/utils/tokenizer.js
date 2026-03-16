/**
 * Lightweight tokenizer heuristic for MBO.
 * Section 7.3.1: Use fast heuristic (length / 4) to weigh content.
 */
function estimateTokens(text) {
  if (!text) return 0;
  // Standard OpenAI/Anthropic heuristic: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Section 7.3.1: Node truncation at 800 tokens.
 * Extracts signature and docstring for truncated functions to preserve interface.
 */
function truncateToTokens(text, maxTokens, suffix = '\n[TRUNCATED: Exceeds token limit. Implementation hidden.]') {
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;

  // Simple signature extractor for JS/TS/Python
  // Captures: docstrings (/** */ or ''') and function headers
  const docstringMatch = text.match(/^(\s*(\/\*\*[\s\S]*?\*\/|'''[\s\S]*?'''|"""[\s\S]*?"""))/);
  const signatureMatch = text.match(/^([\s\S]*?\{|def\s+[\s\S]*?:)/m);

  let preserved = '';
  if (docstringMatch) preserved += docstringMatch[1] + '\n';
  if (signatureMatch) preserved += signatureMatch[1];

  if (preserved && estimateTokens(preserved) < maxTokens) {
    return preserved + suffix;
  }

  // Fallback to raw character slice if signature extraction fails or is too large
  const maxChars = maxTokens * 4;
  return text.slice(0, maxChars) + suffix;
}

module.exports = {
  estimateTokens,
  truncateToTokens
};
