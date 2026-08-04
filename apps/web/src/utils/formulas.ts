// apps/web/src/utils/formulas.ts
// Parser / valutatore leggero per espressioni di Aufmaß (tedesco-friendly)

export type EvalContext = Record<string, number>;

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "comma" }
  | { t: "fn"; name: string; argc: number };

const PRECEDENCE: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "^": 4,
  "u+": 5,
  "u-": 5,
};

const RIGHT_ASSOC = new Set(["^", "u+", "u-"]);

function normalizeNumericLiteral(raw: string): string {
  const s = raw.trim();

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // es. 1.234,56 -> 1234.56
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      return s.replace(/\./g, "").replace(",", ".");
    }
    // es. 1,234.56 -> 1234.56
    return s.replace(/,/g, "");
  }

  if (hasComma) {
    return s.replace(",", ".");
  }

  return s;
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isIdStart(c: string): boolean {
  return /[A-Za-z_]/.test(c);
}

function isIdChar(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c);
}

function tokenize(expr: string): Token[] {
  const s = expr.trim().replace(/^\s*=/, "");
  const tokens: Token[] = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if ("+-*/^".includes(ch)) {
      tokens.push({ t: "op", v: ch });
      i++;
      continue;
    }

    if (ch === "(") {
      tokens.push({ t: "lp" });
      i++;
      continue;
    }

    if (ch === ")") {
      tokens.push({ t: "rp" });
      i++;
      continue;
    }

    if (ch === ",") {
      tokens.push({ t: "comma" });
      i++;
      continue;
    }

    if (isDigit(ch) || ch === "." || ch === ",") {
      let j = i + 1;
      while (j < s.length && /[0-9.,]/.test(s[j])) j++;

      const raw = s.slice(i, j);
      const normalized = normalizeNumericLiteral(raw);
      const num = Number(normalized);

      if (!Number.isFinite(num)) {
        throw new Error(`Ungültige Zahl: ${raw}`);
      }

      tokens.push({ t: "num", v: num });
      i = j;
      continue;
    }

    if (isIdStart(ch)) {
      let j = i + 1;
      while (j < s.length && isIdChar(s[j])) j++;

      tokens.push({ t: "id", v: s.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }

    throw new Error(`Ungültiges Zeichen: '${ch}'`);
  }

  return tokens;
}

type StackItem =
  | { t: "op"; v: string }
  | { t: "lp" }
  | { t: "fnName"; name: string };

type FnFrame = {
  hasValue: boolean;
  commaCount: number;
};

function toRpn(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const ops: StackItem[] = [];
  const fnFrames: FnFrame[] = [];

  let prev: Token | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.t === "num") {
      out.push(token);
      if (fnFrames.length) fnFrames[fnFrames.length - 1].hasValue = true;
      prev = token;
      continue;
    }

    if (token.t === "id") {
      const next = tokens[i + 1];

      if (next?.t === "lp") {
        ops.push({ t: "fnName", name: token.v });
        prev = token;
        continue;
      }

      out.push(token);
      if (fnFrames.length) fnFrames[fnFrames.length - 1].hasValue = true;
      prev = token;
      continue;
    }

    if (token.t === "lp") {
      const prevWasFn = ops.length > 0 && ops[ops.length - 1].t === "fnName";
      ops.push({ t: "lp" });

      if (prevWasFn) {
        fnFrames.push({
          hasValue: false,
          commaCount: 0,
        });
      }

      prev = token;
      continue;
    }

    if (token.t === "comma") {
      while (ops.length && ops[ops.length - 1].t !== "lp") {
        const top = ops.pop()!;
        if (top.t === "op") out.push(top);
      }

      if (!ops.length) throw new Error("Separator ',' an falscher Stelle");
      if (!fnFrames.length) throw new Error("Separator ',' außerhalb Funktion");

      fnFrames[fnFrames.length - 1].commaCount++;
      prev = token;
      continue;
    }

    if (token.t === "op") {
      let op = token.v;

      const unary =
        !prev || prev.t === "op" || prev.t === "lp" || prev.t === "comma";

      if (unary && (op === "+" || op === "-")) {
        op = op === "+" ? "u+" : "u-";
      }

      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t !== "op") break;

        const pTop = PRECEDENCE[top.v];
        const pCur = PRECEDENCE[op];
        const shouldPop = RIGHT_ASSOC.has(op) ? pTop > pCur : pTop >= pCur;

        if (!shouldPop) break;
        out.push(ops.pop() as { t: "op"; v: string });
      }

      ops.push({ t: "op", v: op });
      prev = { t: "op", v: op };
      continue;
    }

    if (token.t === "rp") {
      while (ops.length && ops[ops.length - 1].t !== "lp") {
        const top = ops.pop()!;
        if (top.t === "op") out.push(top);
      }

      if (!ops.length) throw new Error("Klammerfehler");
      ops.pop(); // remove lp

      if (ops.length && ops[ops.length - 1].t === "fnName") {
        const fn = ops.pop() as { t: "fnName"; name: string };
        const frame = fnFrames.pop();

        if (!frame) throw new Error("Funktionsfehler");

        const argc = frame.hasValue ? frame.commaCount + 1 : 0;
        out.push({ t: "fn", name: fn.name, argc });

        if (fnFrames.length) fnFrames[fnFrames.length - 1].hasValue = true;
      } else {
        if (fnFrames.length) fnFrames[fnFrames.length - 1].hasValue = true;
      }

      prev = token;
      continue;
    }
  }

  while (ops.length) {
    const op = ops.pop()!;
    if (op.t === "lp" || op.t === "fnName") {
      throw new Error("Klammerfehler");
    }
    out.push(op);
  }

  return out;
}

function applyFunction(name: string, args: number[]): number {
  switch (name) {
    case "SUM":
      return args.reduce((a, b) => a + b, 0);

    case "MIN":
      return args.length ? Math.min(...args) : 0;

    case "MAX":
      return args.length ? Math.max(...args) : 0;

    case "AVG":
      return args.length ? args.reduce((a, b) => a + b, 0) / args.length : 0;

    case "ROUND": {
      const x = args[0] ?? 0;
      const n = Math.trunc(args[1] ?? 0);
      const factor = Math.pow(10, n);
      return Math.round(x * factor) / factor;
    }

    case "CEIL":
      return Math.ceil(args[0] ?? 0);

    case "FLOOR":
      return Math.floor(args[0] ?? 0);

    case "ABS":
      return Math.abs(args[0] ?? 0);

    default:
      throw new Error(`Unbekannte Funktion: ${name}`);
  }
}

function evalRpn(rpn: Token[], ctx: EvalContext): number {
  const stack: number[] = [];

  const readValue = (name: string): number => {
    const value = ctx[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    throw new Error(`Variable unbekannt: ${name}`);
  };

  for (const token of rpn) {
    if (token.t === "num") {
      stack.push(token.v);
      continue;
    }

    if (token.t === "id") {
      stack.push(readValue(token.v));
      continue;
    }

    if (token.t === "fn") {
      const args = token.argc > 0 ? stack.splice(-token.argc, token.argc) : [];
      stack.push(applyFunction(token.name, args));
      continue;
    }

    if (token.t === "op") {
      if (token.v === "u+") {
        const a = stack.pop();
        if (a == null) throw new Error("Fehlender Operand");
        stack.push(+a);
        continue;
      }

      if (token.v === "u-") {
        const a = stack.pop();
        if (a == null) throw new Error("Fehlender Operand");
        stack.push(-a);
        continue;
      }

      const b = stack.pop();
      const a = stack.pop();

      if (a == null || b == null) {
        throw new Error("Fehlende Operanden");
      }

      switch (token.v) {
        case "+":
          stack.push(a + b);
          break;
        case "-":
          stack.push(a - b);
          break;
        case "*":
          stack.push(a * b);
          break;
        case "/":
          stack.push(b === 0 ? NaN : a / b);
          break;
        case "^":
          stack.push(Math.pow(a, b));
          break;
        default:
          throw new Error(`Unbekannter Operator: ${token.v}`);
      }
    }
  }

  if (stack.length !== 1) {
    throw new Error("Ausdruck nicht auswertbar");
  }

  return stack[0];
}

export function evaluate(expr: string, ctx: EvalContext = {}): number {
  if (!expr || !expr.trim()) return 0;

  const normalizedCtx: EvalContext = Object.fromEntries(
    Object.entries(ctx).map(([k, v]) => [k.toUpperCase(), Number(v)])
  );

  const rpn = toRpn(tokenize(expr));
  const result = evalRpn(rpn, normalizedCtx);

  return Number.isFinite(result) ? result : NaN;
}





