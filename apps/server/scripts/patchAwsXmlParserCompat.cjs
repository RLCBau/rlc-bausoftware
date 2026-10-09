#!/usr/bin/env node
// Compatibility fix for AWS XML builder 3.930.0 with fast-xml-parser 5.7.0.
// The parser rejects numeric entity declarations; numeric XML refs are parsed natively.
const fs=require("fs");
const path=require("path");
const filename=require.resolve("@aws-sdk/xml-builder/dist-cjs/xml-parser.js");
const original=fs.readFileSync(filename,"utf8");
const a='parser.addEntity("#xD", "\\r");';
const b='parser.addEntity("#10", "\\n");';
if (!original.includes(a) || !original.includes(b)) {
  if (original.includes("// RLC_XML_NUMERIC_ENTITY_COMPAT")) process.exit(0);
  throw Error("Unsupported AWS XML parser source; refusing patch");
}
const patched=original.replace(a,"// RLC_XML_NUMERIC_ENTITY_COMPAT: numeric XML refs supported without addEntity").replace(b,"// Numeric XML entities must not be registered as named entities");
fs.writeFileSync(filename,patched);
console.log("AWS_XML_PARSER_COMPAT_APPLIED");
