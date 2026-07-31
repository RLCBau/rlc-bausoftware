// apps/web/src/utils/formulas.ts
// Parser/valutatore leggero per espressioni di Aufmaß (tedesco-friendly)

export type EvalContext = Record<string, number>;

/**
 * Converte "1,25" -> "1.25" e pulisce spazi.
 */
function normalizeNumberToken(tok: string) {
  return tok.replace(/\./g, '').replace(',', '.').trim();
}

/**
 * Tokenizza un'espressione: numeri, operatori, parentesi, funzioni.
 */
function tokenize(expr: string): string[] {
  const s = expr.replace(/\s+/g, '');
  const tokens: string[] = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    // numeri (consentite virgole e punti)
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[0-9,\.]/.test(s[j])) j++;
      tokens.push(normalizeNumberToken(s.slice(i, j)));
      i = j;
      continue;
    }

    // identificatori/funzioni o variabili (A1, B2, SUM, etc.)
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      tokens.push(s.slice(i, j).toUpperCase());
      i = j;
      continue;
    }

    // operatori e parentesi
    if ('+-*/^(),'.includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }

    // caratteri non riconosciuti
    throw new Error(`Ungültiges Zeichen: '${ch}'`);
  }
  return tokens;
}

/**
 * Shunting-yard -> RPN
 */
function toRpn(tokens: string[]): string[] {
  const out: string[] = [];
  const ops: string[] = [];

  const prec: Record<string, number> = { '^': 4, '*': 3, '/': 3, '+': 2, '-': 2 };
  const rightAssoc = new Set(['^']);

  const isFunc = (t: string) => /^[A-Z_]+$/.test(t); // SUM, MIN, MAX
  const isNumOrVar = (t: string) => /^[0-9.]+$/.test(t) || /^[A-Z_][A-Z0-9_]*$/.test(t);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (isNumOrVar(t)) {
      out.push(t);
      continue;
    }

    if (t === ',') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()!);
      continue;
    }

    if (t in prec) {
      while (
        ops.length &&
        ops[ops.length - 1] in prec &&
        ((rightAssoc.has(t) && prec[t] < prec[ops[ops.length - 1]]) ||
          (!rightAssoc.has(t) && prec[t] <= prec[ops[ops.length - 1]]))
      ) {
        out.push(ops.pop()!);
      }
      ops.push(t);
      continue;
    }

    if (t === '(') {
      // funzione immediatamente prima? (SUM( … ))
      const prev = tokens[i - 1];
      if (prev && /^[A-Z_]+$/.test(prev) && out[out.length - 1] === prev) {
        // già spinto; niente
      }
      ops.push(t);
      continue;
    }

    if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()!);
      if (!ops.length) throw new Error('Klammerfehler');
      ops.pop(); // '('

      // funzione prima della parentesi?
      const prev = out[out.length - 1];
      // no-op qui; le funzioni le lasciamo come identificatori in output:
      // nella fase eval riconosceremo SUM/MIN/MAX con arg stack separato.
      continue;
    }

    if (isFunc(t)) {
      out.push(t); // trattiamo le funzioni come token in uscita per semplicità
      continue;
    }

    throw new Error(`Ungültiges Token: ${t}`);
  }

  while (ops.length) {
    const op = ops.pop()!;
    if (op === '(' || op === ')') throw new Error('Klammerfehler');
    out.push(op);
  }

  return out;
}

/**
 * Valuta RPN con contesto (variabili colonna/righe ecc.).
 * Variabili ammesse: A1, B3, TOTAL, ecc. (dipende da chi chiama).
 * Funzioni supportate: SUM(...), MIN(...), MAX(...)
 */
function evalRpn(rpn: string[], ctx: EvalContext): number {
  const st: number[] = [];
  const funcArgs: number[] = []; // collettore temporaneo

  const readValue = (t: string): number => {
    if (/^[0-9.]+$/.test(t)) return parseFloat(t);
    const fromCtx = ctx[t];
    if (typeof fromCtx === 'number' && !Number.isNaN(fromCtx)) return fromCtx;
    throw new Error(`Variable oder Zahl erwartet: ${t}`);
  };

  for (let i = 0; i < rpn.length; i++) {
    const t = rpn[i];

    if (/^[0-9.]+$/.test(t) || /^[A-Z_][A-Z0-9_]*$/.test(t)) {
      // potrebbe essere numero o variabile/funzione
      if (['SUM', 'MIN', 'MAX'].includes(t)) {
        // segno funzione: consumiamo argomenti dal top finché troviamo sentinel (gestito dal chiamante)
        // Semplificazione: usiamo uno “split” in valExpr: SUM(x,y,z) -> tokenizzato con virgole e parentesi,
        // convertito correttamente in RPN. Qui, per funzioni, assumiamo stack già contenente tutti
        // gli argomenti (separati da un marker). Per evitare complessità, usiamo convenzione:
        // Inseriamo uno speciale token "§" prima della lista argomenti durante la costruzione RPN.
        // Per non complicare, implementiamo funzione con regExp direttamente nel pre-parsing: vedi evaluate().
        // Qui NON viene usato.
        st.push(NaN); // placeholder
      } else {
        st.push(readValue(t));
      }
      continue;
    }

    switch (t) {
      case '+': st.push(st.pop()! + st.pop()!); break;
      case '-': {
        const b = st.pop()!, a = st.pop()!;
        st.push(a - b);
        break;
      }
      case '*': st.push(st.pop()! * st.pop()!); break;
      case '/': {
        const b = st.pop()!, a = st.pop()!;
        st.push(a / b);
        break;
      }
      case '^': {
        const b = st.pop()!, a = st.pop()!;
        st.push(Math.pow(a, b));
        break;
      }
      default:
        throw new Error(`Unbekannter Operator: ${t}`);
    }
  }

  if (st.length !== 1) throw new Error('Ausdruck nicht auswertbar');
  return st[0];
}

/**
 * Entry point sicuro: converte funzioni SUM(…) MIN(…) MAX(…) in pura aritmetica
 * espandendo gli argomenti e poi usa shunting-yard.
 */
export function evaluate(expr: string, ctx: EvalContext = {}): number {
  if (!expr || !expr.trim()) return 0;

  // Normalizza virgole decimali “euro-style”
  let e = expr.replace(/\s+/g, '');

  // Funzioni: SUM(a,b,c) -> ((a)+(b)+(c))
  const fn = (name: 'SUM' | 'MIN' | 'MAX', reducer: (arr: number[]) => number) => {
    const rx = new RegExp(`${name}\\(([^()]*)\\)`, 'gi');
    for (;;) {
      const before = e;
      e = e.replace(rx, (_m, inner) => {
        const parts = inner.split(',').map((p: string) => p.trim());
        const values = parts.map(p => evaluate(p, ctx));
        return String(reducer(values));
      });
      if (e === before) break;
    }
  };

  fn('SUM', arr => arr.reduce((a, b) => a + b, 0));
  fn('MIN', arr => Math.min(...arr));
  fn('MAX', arr => Math.max(...arr));

  const rpn = toRpn(tokenize(e));
  return evalRpn(rpn, ctx);
}


