// Wraps src/page.html (the same file published as the Claude artifact) into a full
// standalone document at public/index.html, with the backend shim loaded first.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const page = readFileSync("src/page.html", "utf8");
const shim = readFileSync("shim.js", "utf8");
const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Suhaiku: small poems written with Claude, set on paintings made just for them.">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
<script>${shim}</script>
</head>
<body>
${page}
</body>
</html>
`;
mkdirSync("public", { recursive: true });
writeFileSync("public/index.html", doc);
console.log(`Built public/index.html (${(doc.length / 1024).toFixed(0)} KB)`);
