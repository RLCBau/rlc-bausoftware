#!/usr/bin/env node
// Compatibility: AWS xml-builder numeric named entities vs fast-xml-parser 5.7.
const fs=require("fs");
const filename=require.resolve("@aws-sdk/xml-builder/dist-cjs/xml-parser.js");
let s=fs.readFileSync(filename,"utf8");
const a='parser.addEntity("#xD", "\\r");';
const b='parser.addEntity("#10", "\\n");';
const old='    return parser.parse(xmlString, true);';
const previous='    return parser.parse(xmlString.replace(/&#xD;/gi, "\\r").replace(/&#10;/g, "\\n"), true);';
const current='    return decodeRlcNumericRefs(parser.parse(xmlString, true));';
const helper='function decodeRlcNumericRefs(v) {\n    if (typeof v === "string") return v.replace(/&#xD;/gi, "\\r").replace(/&#10;/g, "\\n");\n    if (Array.isArray(v)) return v.map(decodeRlcNumericRefs);\n    if (v && typeof v === "object") for (const k of Object.keys(v)) v[k] = decodeRlcNumericRefs(v[k]);\n    return v;\n}\n';
if(s.includes(current)&&s.includes('function decodeRlcNumericRefs')) {console.log("AWS_XML_COMPAT_ALREADY_APPLIED");process.exit(0);}
if(s.includes(a)&&s.includes(b)&&s.includes(old)) {
 s=s.replace(a,"// RLC_XML_NUMERIC_ENTITY_COMPAT: numeric refs decoded after parse");
 s=s.replace(b,"// Numeric references are not named entities");
}else if(!s.includes("RLC_XML_NUMERIC_ENTITY_COMPAT")) throw Error("Unsupported AWS XML parser; refusing patch");
if(s.includes(previous)) s=s.replace(previous,current);
else if(s.includes(old)) s=s.replace(old,current);
else throw Error("Unsupported AWS parse method; refusing patch");
s=s.replace("function parseXML(xmlString) {",helper+"function parseXML(xmlString) {");
fs.writeFileSync(filename,s);
console.log("AWS_XML_COMPAT_APPLIED");
