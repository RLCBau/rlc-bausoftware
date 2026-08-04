/* apps/web/src/lib/mengen/formulas.ts
   Mini parser sicuro con shunting-yard (niente eval).
   Supporta:
   - + - * / ^
   - parentesi ()
   - funzioni: SUM, AVG, MIN, MAX, ROUND(x,n), CEIL, FLOOR, ABS, SQRT
   - costanti: PI, E
   - variabili: { L: 2.5, W: 3, row_1: 12, ... }
   - unary minus / unary plus
*/

export type NumMap = Record<string, number>;

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "comma" }
  | { t: "fn"; name: string; argc: number };

const prec: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "^": 4,
  "u+": 5,
  "u-": 5,
};

const rightAssoc = new Set(["^", "u+", "u-"]);

const isDigit = (c: string) => c >= "0" && c <= "9";
const isAlpha = (c: string) => /[A-Za-z_]/.test(c);
const isAlphaNum = (c: string) => /[A-Za-z0-9_]/.test(c);

function tokenize(expr: string): Token[] {
  const s = expr.trim().replace(/^\s*=/, "");
  const out: Token[] = [];
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if ("+-*/^".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }

    if (c === "(") {
      out.push({ t: "lp" });
      i++;
      continue;
    }

    if (c === ")") {
      out.push({ t: "rp" });
      i++;
      continue;
    }

    if (c === ",") {
      out.push({ t: "comma" });
      i++;
      continue;
    }

    if (isDigit(c) || c === ".") {
      let j = i;
      let dotCount = 0;

      while (j < s.length) {
        const ch = s[j];
        if (isDigit(ch)) {
          j++;
          continue;
        }
        if (ch === ".") {
          dotCount++;
          if (dotCount > 1) break;
          j++;
          continue;
        }
        break;
      }

      const raw = s.slice(i, j);
      const v = Number(raw);
      if (!Number.isFinite(v)) {
        throw new Error(`Ungültige Zahl: ${raw}`);
      }

      out.push({ t: "num", v });
      i = j;
      continue;
    }

    if (isAlpha(c)) {
      let j = i + 1;
      while (j < s.length && isAlphaNum(s[j])) j++;
      out.push({ t: "id", v: s.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }

    throw new Error(`Carattere non valido: '${c}'`);
  }

  return out;
}

type StackItem =
  | { t: "op"; v: string }
  | { t: "lp" }
  | { t: "fnName"; name: string };

type FnFrame = {
  hasValue: boolean;
  commaCount: number;
};

function toRPN(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const st: StackItem[] = [];
  const fnFrames: FnFrame[] = [];

  let prev: Token | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];

    if (tk.t === "num") {
      out.push(tk);
      if (fnFrames.length) fnFrames[fnFrames.length - 1].hasValue = true;
      prev = tk;
      continue;
    }

    if (tk.t === "id") {
      const next = tokens[i + 1];
      if (next?.t === "lp") {
        st.push({ t: "fnName", name: tk.v });
        prev = tk;
        continue;
      }

      out.push(tk);
      if (fnFrames.length) fnFrames[fnFrames.length - 1].hasValue = true;
      prev = tk;
      continue;
    }

    if (tk.t === "lp") {
      const prevWasFn = st.length > 0 && st[st.length - 1].t === "fnName";
      st.push({ t: "lp" });

      if (prevWasFn) {
        fnFrames.push({
          hasValue: false,
          commaCount: 0,
        });
      }

      prev = tk;
      continue;
    }

    if (tk.t === "comma") {
      while (st.length && st[st.length - 1].t !== "lp") {
        const top = st.pop()!;
        if (top.t === "op") out.push(top);
      }

      if (!st.length) throw new Error("Separatore ',' fuori posto");
      if (!fnFrames.length) throw new Error("Separatore ',' fuori funzione");

      fnFrames[fnFrames.length - 1].commaCount++;
      prev = tk;
      continue;
    }

    if (tk.t === "op") {
      let op = tk.v;
      const unary =
        !prev || prev.t === "op" || prev.t === "lp" || prev.t === "comma";

      if (unary && (op === "+" || op === "-")) {
        op = op === "+" ? "u+" : "u-";
      }

      while (st.length) {
        const top = st[st.length - 1];
        if (top.t !== "op") break;

        const pTop = prec[top.v];
        const pCur = prec[op];
        const shouldPop = rightAssoc.has(op) ? pTop > pCur : pTop >= pCur;

        if (!shouldPop) break;
        out.push(st.pop() as { t: "op"; v: string });
      }

      st.push({ t: "op", v: op });
      prev = { t: "op", v: op };
      continue;
    }

    if (tk.t === "rp") {
      while (st.length && st[st.length - 1].t !== "lp") {
        const top = st.pop()!;
        if (top.t === "op") out.push(top);
      }

      if (!st.length) throw new Error("Parentesi non bilanciate");
      st.pop();

      if (st.length && st[st.length - 1].t === "fnName") {
        const fn = st.pop() as { t: "fnName"; name: string };
        const frame = fnFrames.pop();
        if (!frame) throw new Error("Funktionsfehler");

        const argc = frame.hasValue ? frame.commaCount + 1 : 0;
        out.push({ t: "fn", name: fn.name, argc });

        if (fnFrames.length) fnFrames[fnFrames.length - 1].hasValue = true;
      } else {
        if (fnFrames.length) fnFrames[fnFrames.length - 1].hasValue = true;
      }

      prev = tk;
      continue;
    }
  }

  while (st.length) {
    const x = st.pop()!;
    if (x.t === "lp" || x.t === "fnName") throw new Error("Parentesi non bilanciate");
    out.push(x);
  }

  return out;
}

function callFn(name: string, args: number[]): number {
  switch (name) {
    case "SUM":
      return args.reduce((a, b) => a + b, 0);

    case "AVG":
      return args.length ? args.reduce((a, b) => a + b, 0) / args.length : 0;

    case "MIN":
      return args.length ? Math.min(...args) : 0;

    case "MAX":
      return args.length ? Math.max(...args) : 0;

    case "ROUND": {
      const x = args[0] ?? 0;
      const n = Math.trunc(args[1] ?? 0);
      const m = Math.pow(10, n);
      return Math.round(x * m) / m;
    }

    case "CEIL":
      return Math.ceil(args[0] ?? 0);

    case "FLOOR":
      return Math.floor(args[0] ?? 0);

    case "ABS":
      return Math.abs(args[0] ?? 0);

    case "SQRT":
      return Math.sqrt(args[0] ?? 0);

    default:
      throw new Error(`Funzione non supportata: ${name}`);
  }
}

function evalRPN(rpn: Token[], vars: NumMap): number {
  const stack: number[] = [];
  const constants: NumMap = { PI: Math.PI, E: Math.E };

  for (const tk of rpn) {
    if (tk.t === "num") {
      stack.push(tk.v);
      continue;
    }

    if (tk.t === "id") {
      const key = tk.v.toUpperCase();
      if (key in vars) {
        stack.push(vars[key]);
      } else if (key in constants) {
        stack.push(constants[key]);
      } else {
        throw new Error(`Variabile sconosciuta: ${tk.v}`);
      }
      continue;
    }

    if (tk.t === "fn") {
      const args = tk.argc > 0 ? stack.splice(-tk.argc, tk.argc) : [];
      stack.push(callFn(tk.name, args));
      continue;
    }

    if (tk.t === "op") {
      if (tk.v === "u+") {
        const a = stack.pop();
        if (a == null) throw new Error("Argomento mancante");
        stack.push(+a);
        continue;
      }

      if (tk.v === "u-") {
        const a = stack.pop();
        if (a == null) throw new Error("Argomento mancante");
        stack.push(-a);
        continue;
      }

      const b = stack.pop();
      const a = stack.pop();
      if (a == null || b == null) throw new Error("Argomenti operatori insufficienti");

      switch (tk.v) {
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
          throw new Error(`Operatore sconosciuto: ${tk.v}`);
      }
    }
  }

  if (stack.length !== 1) throw new Error("Espressione non valida");
  return stack[0];
}

export function evaluateExpression(expr: string, vars: NumMap = {}): number {
  if (!expr || !expr.trim()) return 0;

  const normalizedVars: NumMap = Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [k.toUpperCase(), Number(v)])
  );

  const tokens = tokenize(expr);
  const rpn = toRPN(tokens);
  const res = evalRPN(rpn, normalizedVars);

  return Number.isFinite(res) ? res : NaN;
}





