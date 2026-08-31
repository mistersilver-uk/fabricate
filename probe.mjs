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
// Walk carrying an inForm flag down the tree.
function walk(node, visit, inForm = false, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) { for (const n of node) walk(n, visit, inForm, seen); return; }
  let nowInForm = inForm;
  if (node.type === 'RegularElement') {
    visit(node, inForm);
    if (node.name.toLowerCase() === 'form') nowInForm = true;
  }
  for (const k of Object.keys(node)) {
    if (k === 'parent') continue;
    walk(node[k], visit, nowInForm, seen);
  }
}
const NEVER = new Set(['input', 'select', 'textarea']);
let n = 0;
for (const f of files('src/ui/svelte')) {
  const src = fs.readFileSync(f, 'utf8');
  const ast = parse(src, { modern: true });
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
    n++;
    console.log(`${f.replace('src/ui/svelte/','')}  <${el.name}>${inForm ? ' [in form]' : ''}`);
  });
}
console.log('\nundeclared after narrowing the button exemption: ' + n);
