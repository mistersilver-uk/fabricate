import fs from 'node:fs';
import { parse } from 'svelte/compiler';
function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) files(p, out);
    else if (e.name.endsWith('.svelte')) out.push(p);
  }
  return out;
}
function walk(node, visit, inForm = false, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) { for (const n of node) walk(n, visit, inForm, seen); return; }
  let now = inForm;
  if (node.type === 'RegularElement') {
    visit(node, inForm);
    if (node.name.toLowerCase() === 'form') now = true;
  }
  for (const k of Object.keys(node)) { if (k !== 'parent') walk(node[k], visit, now, seen); }
}
const NEVER = new Set(['input', 'select', 'textarea']);
let added = 0;
for (const f of files('src/ui/svelte')) {
  const src = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = parse(src, { modern: true }); } catch { console.log('PARSE FAIL ' + f); continue; }
  const ends = [];
  walk(ast.fragment, (el, inForm) => {
    const tag = el.name.toLowerCase();
    if (NEVER.has(tag)) return;
    if (tag === 'button' && inForm) return;
    const attrs = el.attributes || [];
    const named = (x) => attrs.find((a) => a.type === 'Attribute' && a.name === x);
    const ti = named('tabindex');
    if (!ti || !/-1/.test(src.slice(ti.start, ti.end))) return;
    if (named('contenteditable')) return;
    if (named('data-keyboard-focus')) return;
    ends.push(ti.end);
  });
  if (!ends.length) continue;
  let out = src;
  for (const at of ends.sort((a, b) => b - a)) {
    const before = out.slice(0, at);
    const indent = before.slice(before.lastIndexOf('\n') + 1).match(/^(\s*)/)[1];
    out = before + `\n${indent}data-keyboard-focus="true"` + out.slice(at);
    added++;
  }
  fs.writeFileSync(f, out);
}
console.log('added: ' + added);
