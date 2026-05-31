export type FormatResult =
  | { ok: true; output: string }
  | { ok: false; error: string };

export function formatJson(input: string): FormatResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Input vazio.' };

  // Tier 1: valid JSON
  try {
    const parsed = JSON.parse(trimmed);
    return { ok: true, output: JSON.stringify(parsed, null, 2) };
  } catch {}

  // Tier 2: recoverable (trailing commas, single quotes, unquoted keys)
  try {
    const fixed = fixJson(trimmed);
    const parsed = JSON.parse(fixed);
    return { ok: true, output: JSON.stringify(parsed, null, 2) };
  } catch {}

  // Tier 3: Kotlin/Java printed object
  try {
    const parsed = parseKotlinObject(trimmed);
    return { ok: true, output: JSON.stringify(parsed, null, 2) };
  } catch {}

  // Error with location
  try {
    JSON.parse(trimmed);
  } catch (e) {
    if (e instanceof SyntaxError) {
      const posMatch = e.message.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        const before = trimmed.slice(0, pos);
        const line = (before.match(/\n/g) ?? []).length + 1;
        const lastNl = before.lastIndexOf('\n');
        const col = lastNl === -1 ? pos + 1 : pos - lastNl;
        return { ok: false, error: `JSON inválido — linha ${line}, col ${col}\n${e.message}` };
      }
      return { ok: false, error: `JSON inválido: ${e.message}` };
    }
  }

  return { ok: false, error: 'Formato não reconhecido.' };
}

// ── Tier 2: light JSON repair ────────────────────────────────────────────────

function fixJson(input: string): string {
  let s = fixSingleQuotes(input);
  s = s.replace(/,(\s*[}\]])/g, '$1');
  s = s.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
  return s;
}

function fixSingleQuotes(input: string): string {
  let result = '';
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === '"') {
      result += c;
      i++;
      while (i < input.length) {
        if (input[i] === '\\') {
          result += input[i] + (input[i + 1] ?? '');
          i += 2;
          continue;
        }
        result += input[i];
        if (input[i++] === '"') break;
      }
    } else if (c === "'") {
      result += '"';
      i++;
      while (i < input.length && input[i] !== "'") {
        if (input[i] === '\\' && i + 1 < input.length) {
          const next = input[i + 1];
          result += next === "'" ? "'" : input[i] + next;
          i += 2;
          continue;
        }
        if (input[i] === '"') result += '\\"';
        else result += input[i];
        i++;
      }
      result += '"';
      if (i < input.length) i++;
    } else {
      result += c;
      i++;
    }
  }
  return result;
}

// ── Tier 3: Kotlin/Java printed-object parser ────────────────────────────────

function parseKotlinObject(input: string): unknown {
  const trimmed = input.trim();
  if (!/^[A-Z]/.test(trimmed) && !trimmed.startsWith('[')) {
    throw new Error('Not a Kotlin/Java object');
  }
  const result = parseKValue(trimmed);
  return result;
}

function parseKValue(src: string): unknown {
  src = src.trim();

  if (/^[A-Z][a-zA-Z0-9_$]*\s*\(/.test(src)) {
    const body = extractBalanced(src, '(', ')');
    return parseKFields(body);
  }

  if (src.startsWith('[')) {
    const body = extractBalanced(src, '[', ']');
    if (!body.trim()) return [];
    return splitBalanced(body).map(parseKValue);
  }

  if (src.startsWith('"') && src.endsWith('"')) return src.slice(1, -1);
  if (src.startsWith("'") && src.endsWith("'")) return src.slice(1, -1);

  if (src === 'null') return null;
  if (src === 'true') return true;
  if (src === 'false') return false;

  const numStr = src.replace(/[LlFfDd]$/, '');
  if (numStr !== '' && !isNaN(Number(numStr))) return Number(numStr);

  return src;
}

function parseKFields(body: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const pair of splitBalanced(body)) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) throw new Error(`Expected key=value: ${trimmed}`);
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    result[key] = parseKValue(val);
  }
  return result;
}

function splitBalanced(src: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const c of src) {
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function extractBalanced(src: string, open: string, close: string): string {
  const start = src.indexOf(open);
  if (start === -1) throw new Error(`No opening '${open}'`);
  let depth = 0;
  let end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) { end = i; break; }
  }
  if (end === -1) throw new Error('Unbalanced brackets');
  return src.slice(start + 1, end);
}

// ── Syntax highlighting tokenizer ────────────────────────────────────────────

export type TokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'ws';

export interface Token {
  type: TokenType;
  text: string;
}

export function tokenize(json: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < json.length) {
    const c = json[i];

    if (/\s/.test(c)) {
      let ws = '';
      while (i < json.length && /\s/.test(json[i])) ws += json[i++];
      tokens.push({ type: 'ws', text: ws });
      continue;
    }

    if (c === '"') {
      let str = '"';
      i++;
      while (i < json.length) {
        if (json[i] === '\\') { str += json[i] + (json[i + 1] ?? ''); i += 2; continue; }
        str += json[i];
        if (json[i++] === '"') break;
      }
      // Peek ahead past whitespace for ':'
      let j = i;
      while (j < json.length && json[j] === ' ') j++;
      tokens.push({ type: json[j] === ':' ? 'key' : 'string', text: str });
      continue;
    }

    if (c === '-' || (c >= '0' && c <= '9')) {
      let num = c === '-' ? (i++, '-') : '';
      while (i < json.length && /[\d.eE+\-]/.test(json[i])) num += json[i++];
      tokens.push({ type: 'number', text: num });
      continue;
    }

    if (json.startsWith('true', i)) { tokens.push({ type: 'boolean', text: 'true' }); i += 4; continue; }
    if (json.startsWith('false', i)) { tokens.push({ type: 'boolean', text: 'false' }); i += 5; continue; }
    if (json.startsWith('null', i)) { tokens.push({ type: 'null', text: 'null' }); i += 4; continue; }

    tokens.push({ type: 'punct', text: c });
    i++;
  }

  return tokens;
}
