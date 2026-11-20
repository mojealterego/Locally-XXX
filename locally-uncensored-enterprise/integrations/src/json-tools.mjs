const bad = (why) => { throw new Error(`JSON tool: ${why}`); };
export function parseJsonDocument(source) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).byteLength > 1024 * 1024) bad('invalid size');
  let data;
  try { data = JSON.parse(source); } catch { bad('invalid JSON'); }
  let nodes = 0;
  const walk = (value, depth) => {
    if (++nodes > 20000 || depth > 48) bad('structure limit');
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key.length > 1024 || ['__proto__', 'prototype', 'constructor'].includes(key)) bad('unsafe object key');
        walk(child, depth + 1);
      }
    }
  };
  walk(data, 0);
  return data;
}
const scalar = value => JSON.stringify(value);
function yaml(value, level = 0) {
  if (!value || typeof value !== 'object') return scalar(value);
  const pad = '  '.repeat(level);
  const entries = Object.entries(value);
  if (!entries.length) return Array.isArray(value) ? '[]' : '{}';
  return entries.map(([key, item]) => {
    const compound = item !== null && typeof item === 'object';
    const prefix = Array.isArray(value) ? `${pad}-` : `${pad}${JSON.stringify(key)}:`;
    return compound ? `${prefix}\n${yaml(item, level + 1)}` : `${prefix} ${scalar(item)}`;
  }).join('\n');
}
function env(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad('ENV requires object root');
  const rows = [], seen = new Set();
  function descend(obj, path = []) {
    for (const [key, item] of Object.entries(obj)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) bad('invalid ENV key');
      const keys = [...path, key];
      if (item !== null && typeof item === 'object') {
        if (Array.isArray(item)) bad('ENV arrays unsupported');
        descend(item, keys);
      } else {
        const name = keys.join('_').toUpperCase();
        if (seen.has(name)) bad('ENV key collision');
        seen.add(name);
        rows.push(`${name}=${scalar(item)}`);
      }
    }
  }
  descend(value);
  return rows.join('\n') + (rows.length ? '\n' : '');
}
export function formatJson(source, mode = 'pretty', indent = 2) {
  if (!['pretty','minify','yaml','env'].includes(mode) || ![2,4].includes(indent)) bad('invalid format');
  const data = parseJsonDocument(source);
  if (mode === 'pretty') return JSON.stringify(data, null, indent) + '\n';
  if (mode === 'minify') return JSON.stringify(data) + '\n';
  if (mode === 'yaml') return yaml(data) + '\n';
  return env(data);
}
