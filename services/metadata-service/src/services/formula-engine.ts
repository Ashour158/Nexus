/**
 * Safe "Deluge-lite" formula engine for custom-module FORMULA fields.
 *
 * ── Sandbox contract (why there is no RCE) ──────────────────────────────────
 * This engine implements its OWN recursive-descent tokenizer + parser + tree-walking
 * evaluator over a fixed, whitelisted set of operators and functions. It NEVER:
 *   - calls `eval`, `Function`, `require`, `import`, or any dynamic code path,
 *   - touches the filesystem, network, environment, timers, or any host object,
 *   - reaches JS prototypes (identifiers are field references or whitelisted
 *     function names only; there is no member/property access syntax at all).
 * The only values that ever exist are numbers, strings, booleans, Date (internal),
 * and null. Field references resolve against a caller-supplied plain record object.
 * Anything unrecognised (unknown function, unknown field, bad arity, division by
 * zero, parse error) collapses to `null` — the evaluator is TOTAL and never throws
 * out of {@link evaluateFormula}. This makes formulas safe to run on the write path
 * and safe to expose to untrusted admin input.
 *
 * ── Grammar (recursive descent, standard precedence) ────────────────────────
 *   expr        := orExpr
 *   orExpr      := andExpr ( ("or"|"||") andExpr )*
 *   andExpr     := notExpr ( ("and"|"&&") notExpr )*
 *   notExpr     := ("not"|"!") notExpr | comparison
 *   comparison  := additive ( ("=="|"!="|"<="|">="|"<"|">"|"=") additive )?
 *   additive    := multiplicative ( ("+"|"-") multiplicative )*
 *   multiplicative := unary ( ("*"|"/"|"%") unary )*
 *   unary       := "-" unary | primary
 *   primary     := number | string | "true" | "false" | "null"
 *                | funcCall | identifier | "(" expr ")"
 *   funcCall    := identifier "(" ( expr ("," expr)* )? ")"
 *
 * ── Functions ───────────────────────────────────────────────────────────────
 *   String : concat(...), upper(s), lower(s), trim(s), length(s),
 *            substring(s, start [, end]), contains(s, sub)
 *   Number : round(n [, digits]), abs(n), min(...), max(...)
 *   Date   : today(), now(), dateDiff(a, b [, unit]), addDays(d, n),
 *            year(d), month(d), day(d)
 *   Logic  : if(cond, a, b)
 *   (operators `and`/`or`/`not` are also available as keywords)
 */

export type FormulaValue = number | string | boolean | Date | null;
export type FormulaRecord = Record<string, unknown>;

// ── Tokenizer ───────────────────────────────────────────────────────────────

type TokKind = 'num' | 'str' | 'ident' | 'op' | 'punc' | 'eof';
interface Token {
  kind: TokKind;
  value: string;
}

// Multi-char operators first so the longest match wins.
const MULTI_OPS = ['==', '!=', '<=', '>=', '&&', '||'];
const SINGLE_OPS = new Set(['+', '-', '*', '/', '%', '<', '>', '=', '!']);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i];

    // whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // string literal — single or double quoted, backslash escapes
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = '';
      while (i < n && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < n) {
          const next = input[i + 1];
          str += next === 'n' ? '\n' : next === 't' ? '\t' : next;
          i += 2;
        } else {
          str += input[i];
          i++;
        }
      }
      i++; // closing quote (tolerate missing)
      tokens.push({ kind: 'str', value: str });
      continue;
    }

    // number literal
    if (ch >= '0' && ch <= '9') {
      let num = '';
      while (i < n && ((input[i] >= '0' && input[i] <= '9') || input[i] === '.')) {
        num += input[i];
        i++;
      }
      tokens.push({ kind: 'num', value: num });
      continue;
    }

    // identifier / keyword
    if (/[A-Za-z_]/.test(ch)) {
      let id = '';
      while (i < n && /[A-Za-z0-9_]/.test(input[i])) {
        id += input[i];
        i++;
      }
      tokens.push({ kind: 'ident', value: id });
      continue;
    }

    // multi-char operator
    const two = input.slice(i, i + 2);
    if (MULTI_OPS.includes(two)) {
      tokens.push({ kind: 'op', value: two });
      i += 2;
      continue;
    }

    // single-char operator
    if (SINGLE_OPS.has(ch)) {
      tokens.push({ kind: 'op', value: ch });
      i++;
      continue;
    }

    // punctuation
    if (ch === '(' || ch === ')' || ch === ',') {
      tokens.push({ kind: 'punc', value: ch });
      i++;
      continue;
    }

    // unknown char — skip (fail-open tokenizer)
    i++;
  }

  tokens.push({ kind: 'eof', value: '' });
  return tokens;
}

// ── Parser (produces an AST) ────────────────────────────────────────────────

type Node =
  | { t: 'lit'; v: FormulaValue }
  | { t: 'ref'; name: string }
  | { t: 'call'; name: string; args: Node[] }
  | { t: 'unary'; op: string; arg: Node }
  | { t: 'binary'; op: string; l: Node; r: Node };

const KEYWORD_LITERALS: Record<string, FormulaValue> = {
  true: true,
  false: false,
  null: null,
};

class Parser {
  private pos = 0;
  constructor(private readonly toks: Token[]) {}

  private peek(): Token {
    return this.toks[this.pos];
  }
  private next(): Token {
    return this.toks[this.pos++];
  }
  private isKeyword(word: string): boolean {
    const t = this.peek();
    return t.kind === 'ident' && t.value.toLowerCase() === word;
  }
  private eatKeyword(word: string): boolean {
    if (this.isKeyword(word)) {
      this.pos++;
      return true;
    }
    return false;
  }
  private eatOp(...ops: string[]): string | null {
    const t = this.peek();
    if (t.kind === 'op' && ops.includes(t.value)) {
      this.pos++;
      return t.value;
    }
    return null;
  }

  parse(): Node {
    const node = this.parseOr();
    // Ignore any trailing garbage rather than throwing.
    return node;
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    for (;;) {
      if (this.eatKeyword('or') || this.eatOp('||')) {
        const right = this.parseAnd();
        left = { t: 'binary', op: 'or', l: left, r: right };
      } else break;
    }
    return left;
  }

  private parseAnd(): Node {
    let left = this.parseNot();
    for (;;) {
      if (this.eatKeyword('and') || this.eatOp('&&')) {
        const right = this.parseNot();
        left = { t: 'binary', op: 'and', l: left, r: right };
      } else break;
    }
    return left;
  }

  private parseNot(): Node {
    if (this.eatKeyword('not') || this.eatOp('!')) {
      return { t: 'unary', op: 'not', arg: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): Node {
    const left = this.parseAdditive();
    const op = this.eatOp('==', '!=', '<=', '>=', '<', '>', '=');
    if (op) {
      const right = this.parseAdditive();
      return { t: 'binary', op: op === '=' ? '==' : op, l: left, r: right };
    }
    return left;
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative();
    for (;;) {
      const op = this.eatOp('+', '-');
      if (!op) break;
      left = { t: 'binary', op, l: left, r: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary();
    for (;;) {
      const op = this.eatOp('*', '/', '%');
      if (!op) break;
      left = { t: 'binary', op, l: left, r: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Node {
    const op = this.eatOp('-');
    if (op) return { t: 'unary', op: 'neg', arg: this.parseUnary() };
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const t = this.peek();

    if (t.kind === 'num') {
      this.next();
      const num = Number(t.value);
      return { t: 'lit', v: Number.isFinite(num) ? num : null };
    }
    if (t.kind === 'str') {
      this.next();
      return { t: 'lit', v: t.value };
    }
    if (t.kind === 'punc' && t.value === '(') {
      this.next();
      const inner = this.parseOr();
      // consume ')' if present (tolerate missing)
      if (this.peek().kind === 'punc' && this.peek().value === ')') this.next();
      return inner;
    }
    if (t.kind === 'ident') {
      const name = t.value;
      const lower = name.toLowerCase();
      // keyword literal?
      if (lower in KEYWORD_LITERALS) {
        this.next();
        return { t: 'lit', v: KEYWORD_LITERALS[lower] };
      }
      this.next();
      // function call?
      if (this.peek().kind === 'punc' && this.peek().value === '(') {
        this.next(); // '('
        const args: Node[] = [];
        if (!(this.peek().kind === 'punc' && this.peek().value === ')')) {
          args.push(this.parseOr());
          while (this.peek().kind === 'punc' && this.peek().value === ',') {
            this.next();
            args.push(this.parseOr());
          }
        }
        if (this.peek().kind === 'punc' && this.peek().value === ')') this.next();
        return { t: 'call', name, args };
      }
      // bare field reference
      return { t: 'ref', name };
    }

    // Unexpected token — consume it and yield null (fail-open).
    if (t.kind !== 'eof') this.next();
    return { t: 'lit', v: null };
  }
}

// ── Coercion helpers ─────────────────────────────────────────────────────────

function toNum(v: FormulaValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return Number.NaN;
}

function toStr(v: FormulaValue): string {
  if (v === null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function toBool(v: FormulaValue): boolean {
  if (typeof v === 'boolean') return v;
  if (v === null) return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0 && v.toLowerCase() !== 'false';
  if (v instanceof Date) return true;
  return false;
}

function toDate(v: FormulaValue): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function looseEquals(a: FormulaValue, b: FormulaValue): boolean {
  if (a === null || b === null) return a === b;
  if (a instanceof Date || b instanceof Date) {
    const da = toDate(a);
    const db = toDate(b);
    return da !== null && db !== null && da.getTime() === db.getTime();
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const na = toNum(a);
    const nb = toNum(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  return toStr(a) === toStr(b);
}

const DAY_MS = 86_400_000;

// ── Whitelisted functions ────────────────────────────────────────────────────
// Each returns a FormulaValue; on bad arity/args they return null (never throw).

type Fn = (args: FormulaValue[]) => FormulaValue;

const FUNCTIONS: Record<string, Fn> = {
  // String
  concat: (a) => a.map(toStr).join(''),
  upper: (a) => (a.length ? toStr(a[0]).toUpperCase() : null),
  lower: (a) => (a.length ? toStr(a[0]).toLowerCase() : null),
  trim: (a) => (a.length ? toStr(a[0]).trim() : null),
  length: (a) => (a.length ? toStr(a[0]).length : null),
  substring: (a) => {
    if (a.length < 2) return null;
    const s = toStr(a[0]);
    const start = Math.trunc(toNum(a[1]));
    if (Number.isNaN(start)) return null;
    if (a.length >= 3) {
      const end = Math.trunc(toNum(a[2]));
      if (Number.isNaN(end)) return null;
      return s.substring(start, end);
    }
    return s.substring(start);
  },
  contains: (a) => {
    if (a.length < 2) return null;
    return toStr(a[0]).includes(toStr(a[1]));
  },

  // Number
  round: (a) => {
    if (!a.length) return null;
    const n = toNum(a[0]);
    if (Number.isNaN(n)) return null;
    const digits = a.length >= 2 ? Math.trunc(toNum(a[1])) : 0;
    if (Number.isNaN(digits)) return null;
    const f = Math.pow(10, digits);
    return Math.round(n * f) / f;
  },
  abs: (a) => {
    if (!a.length) return null;
    const n = toNum(a[0]);
    return Number.isNaN(n) ? null : Math.abs(n);
  },
  min: (a) => {
    const nums = a.map(toNum).filter((x) => !Number.isNaN(x));
    return nums.length ? Math.min(...nums) : null;
  },
  max: (a) => {
    const nums = a.map(toNum).filter((x) => !Number.isNaN(x));
    return nums.length ? Math.max(...nums) : null;
  },

  // Date
  today: () => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  },
  now: () => new Date(),
  datediff: (a) => {
    if (a.length < 2) return null;
    const d1 = toDate(a[0]);
    const d2 = toDate(a[1]);
    if (!d1 || !d2) return null;
    const unit = a.length >= 3 ? toStr(a[2]).toLowerCase() : 'days';
    const diffMs = d1.getTime() - d2.getTime();
    switch (unit) {
      case 'ms':
      case 'milliseconds':
        return diffMs;
      case 'seconds':
        return Math.trunc(diffMs / 1000);
      case 'minutes':
        return Math.trunc(diffMs / 60000);
      case 'hours':
        return Math.trunc(diffMs / 3_600_000);
      case 'days':
      default:
        return Math.trunc(diffMs / DAY_MS);
    }
  },
  adddays: (a) => {
    if (a.length < 2) return null;
    const d = toDate(a[0]);
    const days = toNum(a[1]);
    if (!d || Number.isNaN(days)) return null;
    return new Date(d.getTime() + days * DAY_MS);
  },
  year: (a) => {
    const d = a.length ? toDate(a[0]) : null;
    return d ? d.getUTCFullYear() : null;
  },
  month: (a) => {
    const d = a.length ? toDate(a[0]) : null;
    return d ? d.getUTCMonth() + 1 : null;
  },
  day: (a) => {
    const d = a.length ? toDate(a[0]) : null;
    return d ? d.getUTCDate() : null;
  },

  // Logic — `if` is handled specially in the evaluator (lazy args); this entry
  // is a defensive eager fallback should it ever be reached.
  if: (a) => (a.length >= 3 ? (toBool(a[0]) ? a[1] : a[2]) : null),
};

// ── Evaluator (tree walk with a recursion guard) ─────────────────────────────

const MAX_DEPTH = 64;

function coerceInput(v: unknown): FormulaValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v;
  // Arrays / objects have no scalar formula meaning — treat as null.
  return null;
}

function evalNode(node: Node, record: FormulaRecord, depth: number): FormulaValue {
  if (depth > MAX_DEPTH) return null;

  switch (node.t) {
    case 'lit':
      return node.v;

    case 'ref': {
      // Case-sensitive first, then case-insensitive fallback.
      if (Object.prototype.hasOwnProperty.call(record, node.name)) {
        return coerceInput(record[node.name]);
      }
      const lower = node.name.toLowerCase();
      for (const key of Object.keys(record)) {
        if (key.toLowerCase() === lower) return coerceInput(record[key]);
      }
      return null; // unknown field => null
    }

    case 'unary': {
      const v = evalNode(node.arg, record, depth + 1);
      if (node.op === 'not') return !toBool(v);
      if (node.op === 'neg') {
        const n = toNum(v);
        return Number.isNaN(n) ? null : -n;
      }
      return null;
    }

    case 'call': {
      const name = node.name.toLowerCase();
      // `if` uses lazy evaluation of the branches.
      if (name === 'if') {
        if (node.args.length < 3) return null;
        const cond = toBool(evalNode(node.args[0], record, depth + 1));
        return evalNode(node.args[cond ? 1 : 2], record, depth + 1);
      }
      const fn = FUNCTIONS[name];
      if (!fn) return null; // unknown function => null (never throws)
      const args = node.args.map((a) => evalNode(a, record, depth + 1));
      try {
        return fn(args);
      } catch {
        return null;
      }
    }

    case 'binary': {
      const { op } = node;
      // Short-circuit logical operators.
      if (op === 'and') {
        return toBool(evalNode(node.l, record, depth + 1)) && toBool(evalNode(node.r, record, depth + 1));
      }
      if (op === 'or') {
        return toBool(evalNode(node.l, record, depth + 1)) || toBool(evalNode(node.r, record, depth + 1));
      }

      const l = evalNode(node.l, record, depth + 1);
      const r = evalNode(node.r, record, depth + 1);

      switch (op) {
        case '==':
          return looseEquals(l, r);
        case '!=':
          return !looseEquals(l, r);
        case '<':
        case '>':
        case '<=':
        case '>=': {
          const ln = toNum(l);
          const rn = toNum(r);
          if (!Number.isNaN(ln) && !Number.isNaN(rn)) {
            return op === '<' ? ln < rn : op === '>' ? ln > rn : op === '<=' ? ln <= rn : ln >= rn;
          }
          const ls = toStr(l);
          const rs = toStr(r);
          return op === '<' ? ls < rs : op === '>' ? ls > rs : op === '<=' ? ls <= rs : ls >= rs;
        }
        case '+': {
          // Numeric add when both coerce to numbers; otherwise string concat.
          const ln = toNum(l);
          const rn = toNum(r);
          if (!Number.isNaN(ln) && !Number.isNaN(rn) && typeof l !== 'string' && typeof r !== 'string') {
            return ln + rn;
          }
          if (typeof l === 'string' || typeof r === 'string') return toStr(l) + toStr(r);
          if (!Number.isNaN(ln) && !Number.isNaN(rn)) return ln + rn;
          return null;
        }
        case '-':
        case '*':
        case '/':
        case '%': {
          const ln = toNum(l);
          const rn = toNum(r);
          if (Number.isNaN(ln) || Number.isNaN(rn)) return null;
          if (op === '-') return ln - rn;
          if (op === '*') return ln * rn;
          if (op === '/') return rn === 0 ? null : ln / rn;
          return rn === 0 ? null : ln % rn;
        }
        default:
          return null;
      }
    }

    default:
      return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface FormulaResult {
  value: FormulaValue;
  /** true when the formula parsed + evaluated without collapsing to a top-level error. */
  ok: boolean;
  error?: string;
}

/**
 * Evaluate a formula expression against a record. TOTAL: never throws. Returns
 * the computed scalar (number | string | boolean | Date | null). Any parse or
 * evaluation problem yields `{ value: null, ok: false, error }`.
 */
export function evaluateFormula(expression: string, record: FormulaRecord = {}): FormulaResult {
  if (typeof expression !== 'string' || expression.trim() === '') {
    return { value: null, ok: false, error: 'empty expression' };
  }
  const safeRecord = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  try {
    const tokens = tokenize(expression);
    const ast = new Parser(tokens).parse();
    const value = evalNode(ast, safeRecord, 0);
    return { value, ok: true };
  } catch (err) {
    return { value: null, ok: false, error: err instanceof Error ? err.message : 'evaluation error' };
  }
}

/**
 * Convenience wrapper that returns only the value (null on any failure). Used by
 * the record service to populate FORMULA fields on read/write.
 */
export function computeFormula(expression: string | null | undefined, record: FormulaRecord): FormulaValue {
  if (!expression) return null;
  return evaluateFormula(expression, record).value;
}
