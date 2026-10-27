// Generates two sample EPUBs (English LTR, Pashto RTL) into test/.
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const en = [
  'It was a bright cold day in April, and the clocks were striking thirteen.',
  'The reader turned the page slowly, listening to the wind move across the empty hills.',
  'Nothing in the village had changed, yet everything felt as though it had been rearranged overnight.',
  'She wrote the date in her notebook, underlined it twice, and began to count the stairs.',
  'A single lamp burned in the window of the old library, casting long amber shadows on the wet stones.'
];
const ps = [
  'دا یو د آزمایښت جمله ده چې د ښي څخه کیڼ لوري ته لیکل کیږي.',
  'کتاب لوستل د پوهې او ارامۍ یوه ښه لاره ده، او هر پاڼه نوې نړۍ پرانیزي.',
  'پښتو ژبه د ډیرو لرغونو کیسو او شعرونو خوندي ساتونکې ده.',
  'زه هر سهار د کور په انګړ کې ناست یم او د چای سره کتاب لولم.'
];

function paras(sentences, n, seed) {
  let out = '';
  for (let i = 0; i < n; i++) {
    let p = '';
    for (let k = 0; k < 6; k++) p += sentences[(i * 3 + k + seed) % sentences.length] + ' ';
    out += `<p>${p.trim()}</p>\n`;
  }
  return out;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#c0392b"/><circle cx="200" cy="150" r="90" fill="#f1c40f"/></svg>`;

async function build(name, { lang, rtl, sentences, titles, bookTitle }) {
  const z = new JSZip();
  z.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  z.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  z.file('OEBPS/style.css', `body{font-family:serif;margin:5%;background:#fafafa;color:#333} h1{font-size:1.6em;text-align:center;margin:1em 0} p{margin:0 0 .8em;text-indent:1em}`);
  z.file('OEBPS/img/pic.svg', svg);
  const chap = (i) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}"><head><title>${titles[i]}</title><link rel="stylesheet" href="style.css" type="text/css"/></head><body><h1 id="top">${titles[i]}</h1>${i === 0 ? '<p><img src="img/pic.svg" alt="pic" style="width:60%"/></p>' : ''}${paras(sentences, 40, i)}<h2 id="sec${i}">Section ${i + 1}.2</h2>${paras(sentences, 20, i + 1)}${i === 0 ? '<p><a href="ch2.xhtml#sec1">Jump to chapter 2 section</a></p>' : ''}</body></html>`;
  for (let i = 0; i < 3; i++) z.file(`OEBPS/ch${i + 1}.xhtml`, chap(i));
  z.file('OEBPS/nav.xhtml', `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${[0, 1, 2].map((i) => `<li><a href="ch${i + 1}.xhtml">${titles[i]}</a>${i === 1 ? `<ol><li><a href="ch2.xhtml#sec1">Section 2.2</a></li></ol>` : ''}</li>`).join('')}</ol></nav></body></html>`);
  z.file('OEBPS/content.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:test:${name}</dc:identifier><dc:title>${bookTitle}</dc:title><dc:creator>Test Author</dc:creator><dc:language>${lang}</dc:language><meta name="cover" content="pic"/></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/><item id="pic" href="img/pic.svg" media-type="image/svg+xml"/>${[1, 2, 3].map((i) => `<item id="c${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine${rtl ? ' page-progression-direction="rtl"' : ''}>${[1, 2, 3].map((i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`);
  const buf = await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(path.join(__dirname, `${name}.epub`), buf);
  fs.writeFileSync(path.join(__dirname, `${name}.b64`), buf.toString('base64'));
  console.log(name, buf.length, 'bytes');
}

(async () => {
  await build('sample-en', { lang: 'en', rtl: false, sentences: en, titles: ['The First Chapter', 'The Second Chapter', 'The Third Chapter'], bookTitle: 'Sample Book' });
  await build('sample-ps', { lang: 'ps', rtl: true, sentences: ps, titles: ['لومړی فصل', 'دوهم فصل', 'درېیم فصل'], bookTitle: 'نمونه کتاب' });
})();
