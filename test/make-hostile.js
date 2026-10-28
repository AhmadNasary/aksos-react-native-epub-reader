// Builds EPUBs that exercise the engine's hostile-input handling: node test/make-hostile.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');

const ID = 'urn:uuid:12345678-1234-1234-1234-123456789abc';
const FONT = Buffer.alloc(2000);
for (let i = 0; i < FONT.length; i++) FONT[i] = (i * 7 + 3) & 255;

function idpfObfuscate(buf) {
  const key = crypto.createHash('sha1').update(ID.replace(/[ \t\r\n]/g, ''), 'utf8').digest();
  const out = Buffer.from(buf);
  for (let i = 0; i < Math.min(1040, out.length); i++) out[i] ^= key[i % 20];
  return out;
}

async function build(name, opts) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '﻿<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  if (opts.enc) zip.file('META-INF/encryption.xml', opts.enc);
  zip.file('OEBPS/content.opf', '﻿<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Tom & Jerry</dc:title><dc:creator>Test</dc:creator>' +
    '<dc:language>' + (opts.lang || 'pus') + '</dc:language><dc:identifier id="uid">' + ID + '</dc:identifier></metadata>' +
    '<manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>' +
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="f" href="font.otf" media-type="font/otf"/></manifest>' +
    '<spine toc="ncx"><itemref idref="c1"/><itemref idref="c2"/></spine></package>');
  zip.file('OEBPS/toc.ncx', '<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>' +
    '<navPoint id="a"><navLabel><text>Part A</text></navLabel><content src="c1.xhtml#a"/></navPoint>' +
    '<navPoint id="b"><navLabel><text>Part B</text></navLabel><content src="c1.xhtml#b"/></navPoint>' +
    '<navPoint id="c"><navLabel><text>Chapter Two</text></navLabel><content src="c2.xhtml"/></navPoint></navMap></ncx>');
  zip.file('OEBPS/font.otf', opts.enc ? idpfObfuscate(FONT) : FONT);
  const filler = '<p>' + 'ټکی '.repeat(400) + '</p>';
  zip.file('OEBPS/c1.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ps"><head><title>x</title>' +
    '<meta http-equiv="refresh" content="0;url=data:text/html,pwned"/><base href="http://evil.example/"/>' +
    '<style>@font-face{font-family:T;src:url(font.otf)} body{background:url(http://evil.example/t.png)} p{writing-mode:vertical-rl}</style></head><body onload="parent.__pwned=1">' +
    '<h2 id="a">Part A</h2><p>میخواهم کتاب د زړه</p><p>می‌خواهم</p><p>کِتَاب ۱۲۳ end.</p>' +
    '<img src="x" onerror="parent.__pwned=2"/><img src="http://evil.example/track.gif"/>' +
    '<svg xmlns="http://www.w3.org/2000/svg" onload="parent.__pwned=3"><script>parent.__pwned=4</script></svg>' +
    '<a id="js" href="javascript:parent.__pwned=5">js</a><a id="intent" href="intent://x#Intent;end">intent</a>' +
    '<a id="web" href="https://example.com/">web</a><a id="note" href="c2.xhtml">to chapter two</a>' +
    '<form action="http://evil.example"><input name="q"/></form>' + filler + '<h2 id="b">Part B</h2><p>Start of part B Start.</p>' + filler + '</body></html>');
  zip.file('OEBPS/c2.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><title>y</title></head><body>' +
    '<h1>Chapter Two</h1><p>' + 'This chapter is written in plain English and should lay out left to right. '.repeat(30) + '</p></body></html>');
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(path.join(__dirname, name + '.epub'), buf);
  fs.writeFileSync(path.join(__dirname, name + '.b64'), buf.toString('base64'));
  return buf.length;
}

(async () => {
  const enc = '<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">' +
    '<enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><enc:CipherData><enc:CipherReference URI="OEBPS/font.otf"/></enc:CipherData></enc:EncryptedData></encryption>';
  console.log('hostile', await build('hostile', { enc }));
  const drm = '<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">' +
    '<enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><enc:CipherData><enc:CipherReference URI="OEBPS/c1.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>';
  console.log('drm', await build('drm', { enc: drm }));
  // a BOM in front of a malformed encryption.xml must not hide the DRM
  console.log('drm-broken', await build('drm-broken', { enc: '﻿<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/> & broken' }));
  fs.writeFileSync(path.join(__dirname, 'font.hex'), crypto.createHash('sha1').update(FONT).digest('hex'));
})();
