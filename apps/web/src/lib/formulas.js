// apps/web/src/lib/formulas.ts
const isDigit = (c) => c >= "0" && c <= "9";
const isIdStart = (c) => (c >= "a" && c <= "z") ||
    (c >= "A" && c <= "Z") ||
    c === "_" ||
    c === "$";
const isIdChar = (c) => isIdStart(c) || isDigit(c);
function isOpToken(tk) {
    return !!tk && tk.t === "op";
}
function isValueToken(tk) {
    return !!tk && (tk.t === "num" || tk.t === "id" || tk.t === "rp" || tk.t === "fn");
}
/* =========================================================
   TOKENIZE
   ========================================================= */
export function tokenize(expr) {
    const s = expr.trim().replace(/^\s*=/, "");
    const out = [];
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (c === " " || c === "\t" || c === "\n" || c === "\r") {
            i++;
            continue;
        }
        if ("+-*/^%".includes(c)) {
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
        if (isDigit(c) || (c === "." && isDigit(s[i + 1] || ""))) {
            let j = i + 1;
            let dotCount = c === "." ? 1 : 0;
            while (j < s.length) {
                const ch = s[j];
                if (isDigit(ch)) {
                    j++;
                    continue;
                }
                if (ch === ".") {
                    dotCount++;
                    if (dotCount > 1)
                        break;
                    j++;
                    continue;
                }
                break;
            }
            const raw = s.slice(i, j);
            const num = Number(raw);
            if (!Number.isFinite(num)) {
                throw new Error(`Ungültige Zahl: ${raw}`);
            }
            out.push({ t: "num", v: num });
            i = j;
            continue;
        }
        if (isIdStart(c)) {
            let j = i + 1;
            while (j < s.length && isIdChar(s[j]))
                j++;
            out.push({ t: "id", v: s.slice(i, j) });
            i = j;
            continue;
        }
        throw new Error(`Unerwartetes Zeichen: ${c}`);
    }
    return out;
}
/* =========================================================
   SHUNTING-YARD -> RPN
   ========================================================= */
const prec = {
    "+": 1,
    "-": 1,
    "*": 2,
    "/": 2,
    "%": 2,
    "^": 4,
    "u+": 5,
    "u-": 5,
};
const rightAssoc = new Set(["^", "u+", "u-"]);
export function toRPN(tokens) {
    const out = [];
    const st = [];
    const fnFrames = [];
    let prev;
    for (let i = 0; i < tokens.length; i++) {
        const tk = tokens[i];
        if (tk.t === "num") {
            out.push(tk);
            if (fnFrames.length)
                fnFrames[fnFrames.length - 1].hasValue = true;
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
            if (fnFrames.length)
                fnFrames[fnFrames.length - 1].hasValue = true;
            prev = tk;
            continue;
        }
        if (tk.t === "lp") {
            const prevWasFnName = st.length > 0 && st[st.length - 1].t === "fnName";
            st.push({ t: "lp" });
            if (prevWasFnName) {
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
                const top = st.pop();
                if (top.t === "op")
                    out.push(top);
            }
            if (!st.length)
                throw new Error("Unerwartetes Komma");
            if (!fnFrames.length)
                throw new Error("Komma außerhalb einer Funktion");
            fnFrames[fnFrames.length - 1].commaCount++;
            prev = tk;
            continue;
        }
        if (tk.t === "op") {
            let op = tk.v;
            const unary = !prev ||
                prev.t === "op" ||
                prev.t === "lp" ||
                prev.t === "comma";
            if (unary && (op === "+" || op === "-")) {
                op = op === "+" ? "u+" : "u-";
            }
            while (st.length) {
                const top = st[st.length - 1];
                if (top.t !== "op")
                    break;
                const pTop = prec[top.v];
                const pCur = prec[op];
                const shouldPop = rightAssoc.has(op) ? pTop > pCur : pTop >= pCur;
                if (!shouldPop)
                    break;
                out.push(st.pop());
            }
            st.push({ t: "op", v: op });
            prev = { t: "op", v: op };
            continue;
        }
        if (tk.t === "rp") {
            while (st.length && st[st.length - 1].t !== "lp") {
                const top = st.pop();
                if (top.t === "op")
                    out.push(top);
            }
            if (!st.length)
                throw new Error("Klammern passen nicht");
            st.pop(); // remove lp
            if (st.length && st[st.length - 1].t === "fnName") {
                const fn = st.pop();
                const frame = fnFrames.pop();
                if (!frame)
                    throw new Error("Funktionsfehler");
                const argc = frame.hasValue ? frame.commaCount + 1 : 0;
                out.push({ t: "fn", name: fn.name, argc });
                if (fnFrames.length)
                    fnFrames[fnFrames.length - 1].hasValue = true;
            }
            else {
                if (fnFrames.length)
                    fnFrames[fnFrames.length - 1].hasValue = true;
            }
            prev = tk;
            continue;
        }
    }
    while (st.length) {
        const top = st.pop();
        if (top.t === "lp" || top.t === "fnName") {
            throw new Error("Klammern passen nicht");
        }
        out.push(top);
    }
    return out;
}
/* =========================================================
   FUNCTIONS
   ========================================================= */
function callFn(name, args) {
    switch (name.toLowerCase()) {
        case "round":
            return Math.round(args[0] ?? 0);
        case "ceil":
            return Math.ceil(args[0] ?? 0);
        case "floor":
            return Math.floor(args[0] ?? 0);
        case "abs":
            return Math.abs(args[0] ?? 0);
        case "sqrt":
            return Math.sqrt(args[0] ?? 0);
        case "min":
            return args.length ? Math.min(...args) : 0;
        case "max":
            return args.length ? Math.max(...args) : 0;
        case "sum":
            return args.reduce((a, b) => a + b, 0);
        default:
            throw new Error(`Unbekannte Funktion: ${name}`);
    }
}
/* =========================================================
   EVAL RPN
   ========================================================= */
export function evalRPN(rpn, vars) {
    const st = [];
    for (const tk of rpn) {
        if (tk.t === "num") {
            st.push(tk.v);
            continue;
        }
        if (tk.t === "id") {
            const v = vars[tk.v];
            st.push(typeof v === "number" && Number.isFinite(v) ? v : 0);
            continue;
        }
        if (tk.t === "fn") {
            const args = tk.argc > 0 ? st.splice(-tk.argc, tk.argc) : [];
            st.push(callFn(tk.name, args));
            continue;
        }
        if (tk.t === "op") {
            if (tk.v === "u+") {
                const a = st.pop() ?? 0;
                st.push(+a);
                continue;
            }
            if (tk.v === "u-") {
                const a = st.pop() ?? 0;
                st.push(-a);
                continue;
            }
            const b = st.pop() ?? 0;
            const a = st.pop() ?? 0;
            switch (tk.v) {
                case "+":
                    st.push(a + b);
                    break;
                case "-":
                    st.push(a - b);
                    break;
                case "*":
                    st.push(a * b);
                    break;
                case "/":
                    st.push(b === 0 ? 0 : a / b);
                    break;
                case "%":
                    st.push(b === 0 ? 0 : a % b);
                    break;
                case "^":
                    st.push(Math.pow(a, b));
                    break;
                default:
                    throw new Error(`Unbekannter Operator: ${tk.v}`);
            }
        }
    }
    const result = st.pop() ?? 0;
    return Number.isFinite(result) ? result : 0;
}
/* =========================================================
   PUBLIC API
   ========================================================= */
export function evaluateExpression(expr, vars) {
    if (!expr || !expr.trim())
        return 0;
    try {
        const rpn = toRPN(tokenize(expr));
        const val = evalRPN(rpn, vars);
        return Number.isFinite(val) ? val : 0;
    }
    catch {
        return 0;
    }
}
