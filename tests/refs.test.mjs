// Loads ui/app.js with a do-nothing DOM and checks reference parsing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const books = read('lectio').match(/BOOKS = .*?"""\\\n([\s\S]*?)"""/)[1].split('\n').map(line => {
  const [name, chapters, aliases] = line.split('|');
  return { name, chapters: +chapters, aliases: aliases.split(' ').filter(Boolean) };
});

const stub = new Proxy(function () {}, { get: () => stub, apply: () => stub, set: () => true });
const page = vm.createContext({
  document: stub, localStorage: {}, URLSearchParams, addEventListener() {}, fetch: () => new Promise(() => {}),
});
vm.runInContext(read('ui/app.js'), page);
vm.runInContext(`META = ${JSON.stringify({ books })}`, page);

const ref = s => {
  const r = vm.runInContext(`parseRef(${JSON.stringify(s)})`, page);
  return r && [books[r.b - 1].name, r.c].filter(Boolean).join(' ') + (r.v ? `:${r.v}` : '');
};

test('references', () => {
  const cases = {
    'jn 3:16': 'John 3:16',
    'john 3': 'John 3',
    '1 cor 13': '1 Corinthians 13',
    'I Cor 13:4': '1 Corinthians 13:4',
    'ii kings 2': '2 Kings 2',
    'ps 23': 'Psalms 23',
    'psalm 119:105': 'Psalms 119:105',
    'song 2': 'Song of Songs 2',
    'sos 1': 'Song of Songs 1',
    'jude 5': 'Jude 1:5',
    '3jn 4': '3 John 1:4',
    'rev 22:21': 'Revelation 22:21',
    'phil 4:13': 'Philippians 4:13',
    'php 2': 'Philippians 2',
    'jas 1': 'James 1',
    'eccl 3:1': 'Ecclesiastes 3:1',
    'isa 53': 'Isaiah 53',
    'gen': 'Genesis',
    'matt 29': null,
    'zz 4': null,
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(ref(input), expected, input);
});
