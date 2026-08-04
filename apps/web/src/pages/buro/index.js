import { jsx as _jsx } from "react/jsx-runtime";
import { rlcClass } from "../../ui/rlcRuntimeStyle";
const mainStyle = {
    padding: 0,
    minWidth: 0,
    width: "100%"
};
export default function BuroLayout({ children }) {
    return (_jsx("main", { className: rlcClass("card", mainStyle), children: children }));
}
