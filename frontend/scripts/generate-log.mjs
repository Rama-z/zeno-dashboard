import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, '..', 'sesi-hermes-discord-gemini.md');
const output = resolve(root, 'src', 'generated-log.ts');
const markdown = await readFile(source, 'utf8');
const chunks = markdown.split(/^## (?=\d+\.)/m).filter(Boolean);
const sections = chunks.slice(1).map((chunk) => {
  const lines = chunk.trim().split('\n');
  const title = lines.shift().trim();
  const body = lines.join('\n').trim();
  const question = body.match(/### Pertanyaan\n([\s\S]*?)(?=\n### Jawaban|$)/)?.[1]?.trim() ?? '';
  const answer = body.match(/### Jawaban\n([\s\S]*)/)?.[1]?.trim() ?? body;
  const plain = answer.replace(/[`*_>#-]/g, ' ').replace(/\s+/g, ' ').trim();
  const status = /berhasil|aktif|terverifikasi|terhubung|dapat mengirim/i.test(answer) ? 'success' : 'info';
  return { title, question, answer, excerpt: plain.slice(0, 180) + (plain.length > 180 ? '…' : ''), status };
});
const sourceLabel = 'sesi-hermes-discord-gemini.md';
const result = `export type LogSection = ${JSON.stringify(sections, null, 2)}[number];\nexport const sessionLog = ${JSON.stringify(sections, null, 2)} as const;\nexport const sourceFile = ${JSON.stringify(sourceLabel)};\nexport const generatedAt = ${JSON.stringify(new Date().toISOString())};\n`;
await writeFile(output, result);
console.log(`Generated ${sections.length} sections from ${sourceLabel}`);
