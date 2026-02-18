/* apps/web/src/lib/mengen/formulas.ts
   Mini parser sicuro con shunting-yard (niente eval).
   Supporta: + - * / ^  ( ) ,    funzioni: SUM, AVG, MIN, MAX, ROUND(x,n), CEIL, FLOOR
   Costanti: PI, E
   Variabili: passate via map { L: 2.5, W: 3, ... } e/o { row_1: 12, ... }
*/

export type NumMap = Record<string, number>;

const isDigit = (c: string) => /[0-9.]/.test(c);
const isAlpha = (c: string) => /[A-Za-z_]/.test(c);
const prec: Record<string, number> = { "+":1, "-":1, "*":2, "/":2, "^":3 };
const rightAssoc: Record<string, boolean> = { "^": true };

function toTokens(expr: string): string[] {
  const s = expr.replace(/\s+/g, "").replace(/,/g, "."); // supporto virgola decimale
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];

    if (isDigit(c)) {
      let j = i+1;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      out.push(s.slice(i, j));
      i = j;
      continue;
    }
    if (isAlpha(c)) {
      let j = i+1;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      out.push(s.slice(i, j).toUpperCase()); // funzioni/variabili case-insensitive
      i = j;
      continue;
    }
    if ("+-*/^(),".includes(c)) { out.push(c); i++; continue; }
    if ("()".includes(c)) { out.push(c); i++; continue; }
    throw new Error(`Carattere non valido: '${c}'`);
  }
  return out;
}

function toRPN(tokens: string[]): string[] {
  const out: string[] = [];
  const st: string[] = [];

  // per distinguere funzione da variabile: se seguito da "(" è funzione
  const isFunc = (t: string, idx: number) => /[A-Z_][A-Z0-9_]*/.test(t) && tokens[idx+1] === "(";

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (/^[0-9.]+$/.test(t) || /^[A-Z_][A-Z0-9_]*$/.test(t) && !isFunc(t, i)) {
      out.push(t);
    } else if (isFunc(t, i)) {
      st.push(t); // funzione
    } else if (t === ",") {
      while (st.length && st[st.length-1] !== "(") out.push(st.pop()!);
      if (!st.length) throw new Error("Separatore ',' fuori posto");
    } else if (t in prec) {
      while (
        st.length &&
        st[st.length-1] in prec &&
        ( (rightAssoc[t] !== true && prec[st[st.length-1]] >= prec[t]) ||
          (rightAssoc[t] === true && prec[st[st.length-1]] >  prec[t]) )
      ) out.push(st.pop()!);
      st.push(t);
    } else if (t === "(") {
      st.push(t);
    } else if (t === ")") {
      while (st.length && st[st.length-1] !== "(") out.push(st.pop()!);
      if (!st.length) throw new Error("Parentesi non bilanciate");
      st.pop(); // rimuovi "("
      if (st.length && /^[A-Z_][A-Z0-9_]*$/.test(st[st.length-1])) {
        out.push(st.pop()!); // funzione
      }
    } else {
      throw new Error(`Token sconosciuto: ${t}`);
    }
  }
  while (st.length) {
    const x = st.pop()!;
    if (x === "(" || x === ")") throw new Error("Parentesi non bilanciate");
    out.push(x);
  }
  return out;
}

function fnApply(name: string, stack: number[]) {
  const pop1 = () => { const v = stack.pop(); if (v==null) throw new Error("Argomenti insufficienti"); return v; };

  switch (name) {
    case "SUM": { const b = pop1(), a = pop1(); stack.push(a + b); break; }
    case "AVG": { const b = pop1(), a = pop1(); stack.push((a + b)/2); break; }
    case "MIN": { const b = pop1(), a = pop1(); stack.push(Math.min(a,b)); break; }
    case "MAX": { const b = pop1(), a = pop1(); stack.push(Math.max(a,b)); break; }
    case "ROUND": { const n = pop1(), x = pop1(); const m = Math.pow(10, n|0); stack.push(Math.round(x*m)/m); break; }
    case "CEIL": { const x = pop1(); stack.push(Math.ceil(x)); break; }
    case "FLOOR": { const x = pop1(); stack.push(Math.floor(x)); break; }
    default: throw new Error(`Funzione non supportata: ${name}`);
  }
}

export function evaluateExpression(expr: string, vars: NumMap = {}): number {
  if (!expr || !expr.trim()) return 0;
  const tokens = toTokens(expr);
  const rpn = toRPN(tokens);
  const stack: number[] = [];

  const constants: NumMap = { PI: Math.PI, E: Math.E };

  for (const t of rpn) {
    if (/^[0-9.]+$/.test(t)) {
      stack.push(parseFloat(t));
    } else if (t in prec) {
      const b = stack.pop(), a = stack.pop();
      if (a==null || b==null) throw new Error("Argomenti operatori insufficienti");
      switch (t) {
        case "+": stack.push(a+b); break;
        case "-": stack.push(a-b); break;
        case "*": stack.push(a*b); break;
        case "/": stack.push(b===0? NaN : a/b); break;
        case "^": stack.push(Math.pow(a,b)); break;
      }
    } else if (/^[A-Z_][A-Z0-9_]*$/.test(t)) {
      // variabile o funzione (la funzione sarebbe già stata “consumata” in RPN)
      const key = t.toUpperCase();
      const hasVar = vars[key] != null;
      const hasConst = constants[key] != null;
      if (!hasVar && !hasConst) throw new Error(`Variabile sconosciuta: ${t}`);
      stack.push((hasVar ? vars[key] : constants[key])!);
    } else {
      // in RPN le funzioni appaiono come token “nudi”
      fnApply(t, stack);
    }
  }
  if (stack.length !== 1) throw new Error("Espressione non valida");
  const res = stack[0];
  return Number.isFinite(res) ? res : NaN;
}
