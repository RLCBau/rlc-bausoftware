// apps/web/src/lib/formulas.ts
/**
 * Valutatore di formule molto semplice e sicuro (niente eval).
 * Supporta:
 *  - Numeri (punto decimale)
 *  - + - * /  ^  (potenza)
 *  - parentesi ( )
 *  - riferimenti a variabili (L,B,H,D,T,N, qualsiasi chiave [a-zA-Z_]\w*)
 *  - funzioni: round(x), ceil(x), floor(x), min(a,b,...), max(a,b,...), sum(a,b,...)
 *  - formule con prefisso opzionale "=" (es. "=L*B")
 */

export type Vars = Record<string, number | undefined>;

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "lp" } // (
  | { t: "rp" } // )
  | { t: "comma" };

const isDigit = (c: string) => c >= "0" && c <= "9";
const isIdStart = (c: string) =>
  (c >= "a" && c <= "z") ||
  (c >= "A" && c <= "Z") ||
  c === "_" ||
  c === "$";
const isIdChar = (c: string) => isIdStart(c) || isDigit(c);

export function tokenize(expr: string): Token[] {
  const s = expr.trim().replace(/^\s*=/, ""); // togli "=" iniziale se presente
  const out: Token[] = [];
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (c === " " || c === "\t" || c === "\n") {
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

    if (isDigit(c) || (c === "." && isDigit(s[i + 1]))) {
      let j = i + 1;
      while (j < s.length && (isDigit(s[j]) || s[j] === ".")) j++;
      out.push({ t: "num", v: parseFloat(s.slice(i, j)) });
      i = j;
      continue;
    }

    if (isIdStart(c)) {
      let j = i + 1;
      while (j < s.length && isIdChar(s[j])) j++;
      out.push({ t: "id", v: s.slice(i, j) });
      i = j;
      continue;
    }

    throw new Error("Unerwartetes Zeichen: " + c);
  }
  return out;
}

// Shunting-yard -> RPN
const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };

export function toRPN(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const st: Token[] = [];

  // per funzioni e argomenti
  const funcStack: string[] = [];
  const argCount: number[] = [];

  let i = 0;
  while (i < tokens.length) {
    const tk = tokens[i];

    if (tk.t === "num" || tk.t === "id") {
      // se un id è seguito da LP -> è una funzione
      const next = tokens[i + 1];
      if (tk.t === "id" && next && next.t === "lp") {
        funcStack.push(tk.v);
        argCount.push(0);
        st.push({ t: "lp" });
        i += 2; // consumiamo id + lp
        continue;
      }
      out.push(tk);
      i++;
      continue;
    }

    if (tk.t === "comma") {
      // svuotiamo fino alla parentesi
      while (st.length && st[st.length - 1].t !== "lp") out.push(st.pop()!);
      if (!argCount.length) throw new Error("Unerwartetes Komma");
      argCount[argCount.length - 1]++; // nuovo argomento
      i++;
      continue;
    }

    if (tk.t === "op") {
      while (
        st.length &&
        st[st.length - 1].t === "op" &&
        prec[(st[st.length - 1] as any).v] >= prec[tk.v]
      ) {
        out.push(st.pop()!);
      }
      st.push(tk);
      i++;
      continue;
    }
    if (tk.t === "lp") {
      st.push(tk);
      i++;
      continue;
    }
    if (tk.t === "rp") {
      while (st.length && st[st.length - 1].t !== "lp") out.push(st.pop()!);
      if (!st.length) throw new Error("Klammern passen nicht");
      st.pop(); // remove '('

      // se stiamo chiudendo una funzione
      if (argCount.length) {
        const fn = funcStack.pop()!;
        const cnt = argCount.pop()!;
        // se c'era almeno un argomento, l'ultima parte non vede la virgola
        const totalArgs = cnt + 1;
        out.push({ t: "id", v: `__fn__${fn}__${totalArgs}` });
      }
      i++;
      continue;
    }
  }

  while (st.length) {
    const t = st.pop()!;
    if (t.t === "lp" || t.t === "rp") throw new Error("Klammern passen nicht");
    out.push(t);
  }
  return out;
}

function callFn(name: string, args: number[]): number {
  switch (name) {
    case "round":
      return Math.round(args[0] ?? 0);
    case "ceil":
      return Math.ceil(args[0] ?? 0);
    case "floor":
      return Math.floor(args[0] ?? 0);
    case "min":
      return Math.min(...args);
    case "max":
      return Math.max(...args);
    case "sum":
      return args.reduce((a, b) => a + b, 0);
    default:
      throw new Error("Unbekannte Funktion: " + name);
  }
}

export function evalRPN(rpn: Token[], vars: Vars): number {
  const st: number[] = [];

  for (const tk of rpn) {
    if (tk.t === "num") {
      st.push(tk.v);
    } else if (tk.t === "id") {
      // funzione codificata?
      if (tk.v.startsWith("__fn__")) {
        const [, fnName, argN] = tk.v.match(/^__fn__(.+)__(\d+)$/)!;
        const n = parseInt(argN, 10);
        const args = st.splice(-n, n);
        st.push(callFn(fnName, args));
        continue;
      }
      const v = vars[tk.v];
      st.push(typeof v === "number" ? v : 0);
    } else if (tk.t === "op") {
      const b = st.pop() ?? 0;
      const a = st.pop() ?? 0;
      switch (tk.v) {
        case "+": st.push(a + b); break;
        case "-": st.push(a - b); break;
        case "*": st.push(a * b); break;
        case "/": st.push(b === 0 ? 0 : a / b); break;
        case "^": st.push(Math.pow(a, b)); break;
      }
    }
  }
  return st.pop() ?? 0;
}

export function evaluateExpression(expr: string, vars: Vars): number {
  if (!expr || !expr.trim()) return 0;
  try {
    const rpn = toRPN(tokenize(expr));
    const val = evalRPN(rpn, vars);
    return isFinite(val) ? val : 0;
  } catch {
    return 0;
  }
}
