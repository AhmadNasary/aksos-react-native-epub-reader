/*
 * EPUB reader engine. Runs inside the WebView (or any browser).
 *
 *   native -> engine : window.__cmd(jsonString)
 *   engine -> native : ReactNativeWebView.postMessage(JSON {type, data})
 *
 * Offsets everywhere are character offsets into the concatenated text nodes of
 * a chapter body (see collectSegs). They survive font/size/theme changes, which
 * is why locations, highlights and bookmarks are stored as {spine, offset}.
 *
 * Page turn modes: 'slide' (finger-follow), 'curl' (hinged page flip),
 * 'fade' (cross-fade) and 'scroll' (continuous vertical scroll per chapter).
 * Curl and fade animate a "ghost" iframe that holds a copy of the chapter.
 */
(function () {
  'use strict';

  var RN = window.ReactNativeWebView;
  var XLINK = 'http://www.w3.org/1999/xlink';
  var XHTML = 'http://www.w3.org/1999/xhtml';
  var RTL_LANGS = ['ar', 'fa', 'ps', 'ur', 'he', 'yi', 'ckb', 'ug', 'sd', 'dv'];
  var HL_COLORS = {
    yellow: ['rgba(255,214,10,.42)', '#e6b800'],
    green: ['rgba(52,199,89,.38)', '#2fb24f'],
    blue: ['rgba(10,132,255,.32)', '#0a84ff'],
    pink: ['rgba(255,55,95,.32)', '#ff375f'],
    purple: ['rgba(191,90,242,.34)', '#bf5af2']
  };

  var frame = document.getElementById('frame');
  var ghost = document.getElementById('ghost');
  var hdr = document.getElementById('hdr');
  var ftr = document.getElementById('ftr');

  var S = {
    zip: null, names: {}, spine: [], toc: [], rtl: false, meta: {},
    texts: [], cum: [], totalLen: 0, indexed: false,
    cur: -1, page: 0, pageCount: 1, token: 0,
    doc: null, win: null, segs: [], segMap: null, curText: '',
    pageStarts: {}, dataCache: {},
    highlights: [], sel: null, searchId: 0, dragged: false,
    G: null, ghostDirty: true, labelsExternal: false,
    settings: {
      bg: '#ffffff', fg: '#000000', link: '#0a60ff',
      fontFamily: 'original', fontSize: 18, lineHeight: 1.5,
      marginX: 28, gap: 48, justify: false, bold: false,
      columns: 'auto', letterSpacing: 0, wordSpacing: 0, mode: 'slide',
      insets: { top: 60, bottom: 52 }, direction: 'auto',
      showHeader: true, showFooter: true
    }
  };

  function post(type, data) {
    var m = JSON.stringify({ type: type, data: data || {} });
    if (RN) RN.postMessage(m);
    else if (window.__harnessPost) window.__harnessPost(type, data || {});
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  /* ------------------------------------------------------------ zip paths */

  function dirOf(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }

  function resolvePath(base, rel) {
    if (rel == null || /^[a-z][a-z0-9+.-]*:/i.test(rel)) return null;
    var p = rel.split('#')[0].split('?')[0];
    if (!p) return base;
    var full = p.charAt(0) === '/' ? p.slice(1) : dirOf(base) + p;
    var out = [];
    full.split('/').forEach(function (s) {
      if (s === '..') out.pop();
      else if (s !== '.' && s !== '') out.push(s);
    });
    var joined = out.join('/');
    try { return decodeURIComponent(joined); } catch (e) { return joined; }
  }

  function getFile(path) {
    if (!path) return null;
    var f = S.zip.file(path);
    if (f) return f;
    var real = S.names[path.toLowerCase()];
    return real ? S.zip.file(real) : null;
  }
  function readText(path) {
    var f = getFile(path);
    return f ? f.async('string') : Promise.resolve(null);
  }

  var MIME = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    svg: 'image/svg+xml', webp: 'image/webp', css: 'text/css',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2'
  };
  function mimeOf(path) {
    var m = /\.([a-z0-9]+)$/i.exec(path);
    return (m && MIME[m[1].toLowerCase()]) || 'application/octet-stream';
  }
  function dataUri(path) {
    if (S.dataCache[path]) return Promise.resolve(S.dataCache[path]);
    var f = getFile(path);
    if (!f) return Promise.resolve(null);
    return f.async('base64').then(function (b64) {
      var uri = 'data:' + mimeOf(path) + ';base64,' + b64;
      S.dataCache[path] = uri;
      return uri;
    });
  }

  /* ---------------------------------------------------------------- xml */

  function parseXml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
  function byLocal(root, name) {
    return Array.prototype.slice.call(root.getElementsByTagNameNS('*', name));
  }
  function firstLocal(root, name) { return byLocal(root, name)[0] || null; }
  function attrLocal(el, name) {
    for (var i = 0; i < el.attributes.length; i++) {
      if (el.attributes[i].localName === name) return el.attributes[i].value;
    }
    return null;
  }
  function parseMarkup(raw) {
    var d = new DOMParser().parseFromString(raw, 'application/xhtml+xml');
    if (d.getElementsByTagName('parsererror').length || !d.body) {
      d = new DOMParser().parseFromString(raw, 'text/html');
    }
    return d;
  }

  /* --------------------------------------------------------- book opening */

  async function openBook(b64) {
    S.zip = await JSZip.loadAsync(b64, { base64: true });
    S.names = {};
    Object.keys(S.zip.files).forEach(function (n) { S.names[n.toLowerCase()] = n; });

    var enc = await readText('META-INF/encryption.xml');
    if (enc) {
      var algos = byLocal(parseXml(enc), 'EncryptionMethod').map(function (e) { return e.getAttribute('Algorithm') || ''; });
      var drm = algos.some(function (a) {
        return a.indexOf('idpf.org/2008/embedding') < 0 && a.indexOf('ns.adobe.com/pdf/enc#RC') < 0;
      });
      if (drm) throw new Error('This book is protected by DRM and cannot be opened.');
    }

    var container = await readText('META-INF/container.xml');
    if (!container) throw new Error('Not a valid EPUB (container.xml is missing).');
    var rootfile = firstLocal(parseXml(container), 'rootfile');
    var opfPath = rootfile && rootfile.getAttribute('full-path');
    var opfText = opfPath && await readText(opfPath);
    if (!opfText) throw new Error('Not a valid EPUB (package document is missing).');
    var opf = parseXml(opfText);

    var manifest = {};
    byLocal(opf, 'item').forEach(function (it) {
      var href = it.getAttribute('href');
      manifest[it.getAttribute('id')] = {
        id: it.getAttribute('id'), href: href,
        path: resolvePath(opfPath, href),
        type: it.getAttribute('media-type') || '',
        props: it.getAttribute('properties') || ''
      };
    });

    var spineEl = firstLocal(opf, 'spine');
    S.spine = byLocal(spineEl, 'itemref').map(function (r) {
      return manifest[r.getAttribute('idref')];
    }).filter(function (m) {
      return m && /html|xml/i.test(m.type) || (m && /\.x?html?$/i.test(m.path));
    });
    if (!S.spine.length) throw new Error('This EPUB has no readable content.');

    var title = firstLocal(opf, 'title');
    var lang = firstLocal(opf, 'language');
    S.meta = {
      title: title && !/^(unknown|untitled|none|n\/a)$/i.test(title.textContent.trim()) ? title.textContent.trim() : '',
      author: byLocal(opf, 'creator').map(function (c) { return c.textContent.trim(); }).join(', '),
      language: lang ? lang.textContent.trim() : '',
      publisher: (firstLocal(opf, 'publisher') || { textContent: '' }).textContent.trim()
    };
    var ppd = spineEl.getAttribute('page-progression-direction');
    var langBase = S.meta.language.toLowerCase().split('-')[0];
    var autoRtl = ppd ? ppd === 'rtl' : RTL_LANGS.indexOf(langBase) >= 0;
    var dirSetting = S.settings.direction;
    S.rtl = dirSetting === 'rtl' ? true : dirSetting === 'ltr' ? false : autoRtl;

    if (dirSetting === 'auto' && !S.rtl) {
      var byContent = await contentIsRtl();
      if (byContent) S.rtl = true;
    }

    S.toc = await parseToc(opf, manifest, spineEl, opfPath);
    post('metadata', S.meta);
    post('toc', { items: S.toc, rtl: S.rtl, spineCount: S.spine.length });
    sendCover(opf, manifest);
  }

  // true when the first chapters are mostly Arabic-script text (Pashto, Dari, Persian, Arabic, Urdu ...)
  async function contentIsRtl() {
    var arabic = 0, latin = 0;
    var AR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, LA = /[A-Za-z]/g;
    for (var i = 0; i < Math.min(S.spine.length, 6) && arabic + latin < 1500; i++) {
      try {
        var text = (await parseChapter(i)).body.textContent || '';
        arabic += (text.match(AR) || []).length;
        latin += (text.match(LA) || []).length;
      } catch (e) { /* ignore unreadable chapters */ }
    }
    return arabic > 40 && arabic > latin * 1.5;
  }

  function spineIndexOfPath(path) {
    for (var i = 0; i < S.spine.length; i++) if (S.spine[i].path === path) return i;
    return -1;
  }

  async function parseToc(opf, manifest, spineEl, opfPath) {
    var items = [];
    function add(label, href, level, base) {
      var path = resolvePath(base, href);
      var frag = href && href.indexOf('#') >= 0 ? href.split('#')[1] : '';
      var idx = path ? spineIndexOfPath(path) : -1;
      if (idx < 0) return;
      items.push({ label: (label || '').replace(/\s+/g, ' ').trim(), spine: idx, fragment: frag, level: level });
    }

    var navItem = null;
    Object.keys(manifest).forEach(function (k) {
      if (/(^|\s)nav(\s|$)/.test(manifest[k].props)) navItem = manifest[k];
    });
    if (navItem) {
      var navText = await readText(navItem.path);
      if (navText) {
        var nd = parseMarkup(navText);
        var navs = Array.prototype.slice.call(nd.getElementsByTagName('nav'));
        var navEl = navs.filter(function (n) { return /toc/.test(attrLocal(n, 'type') || ''); })[0] || navs[0];
        if (navEl) {
          (function walk(ol, level) {
            Array.prototype.forEach.call(ol.children, function (li) {
              if (li.localName !== 'li') return;
              var a = null, sub = null;
              Array.prototype.forEach.call(li.children, function (c) {
                if (c.localName === 'a' || c.localName === 'span') a = a || c;
                if (c.localName === 'ol') sub = c;
              });
              if (a) add(a.textContent, a.getAttribute('href'), level, navItem.path);
              if (sub) walk(sub, level + 1);
            });
          })(navEl.getElementsByTagName('ol')[0] || navEl, 0);
        }
      }
    }
    if (items.length) return items;

    var ncxId = spineEl.getAttribute('toc');
    var ncx = (ncxId && manifest[ncxId]) ||
      Object.keys(manifest).map(function (k) { return manifest[k]; }).filter(function (m) { return /ncx/.test(m.type); })[0];
    if (ncx) {
      var ncxText = await readText(ncx.path);
      if (ncxText) {
        var map = firstLocal(parseXml(ncxText), 'navMap');
        (function walk(parent, level) {
          Array.prototype.forEach.call(parent.children, function (np) {
            if (np.localName !== 'navPoint') return;
            var label = firstLocal(np, 'text');
            var content = firstLocal(np, 'content');
            if (content) add(label ? label.textContent : '', content.getAttribute('src'), level, ncx.path);
            walk(np, level + 1);
          });
        })(map || { children: [] }, 0);
      }
    }
    return items;
  }

  function sendCover(opf, manifest) {
    var item = null;
    Object.keys(manifest).forEach(function (k) {
      if (/cover-image/.test(manifest[k].props)) item = manifest[k];
    });
    if (!item) {
      var meta = byLocal(opf, 'meta').filter(function (m) { return m.getAttribute('name') === 'cover'; })[0];
      if (meta) item = manifest[meta.getAttribute('content')];
    }
    if (item && /image/.test(item.type)) {
      dataUri(item.path).then(function (uri) { if (uri) post('cover', { uri: uri }); });
    }
  }

  function chapterTitle(i) {
    var best = '';
    for (var k = 0; k < S.toc.length; k++) {
      if (S.toc[k].spine <= i) best = S.toc[k].label; else break;
    }
    return best || S.meta.title || '';
  }

  /* ------------------------------------------------------------- chapters */

  function collectSegs(root) {
    var w = root.ownerDocument.createTreeWalker(root, 4, null);
    var segs = [], pos = 0, n;
    while ((n = w.nextNode())) {
      var len = n.data.length;
      segs.push({ node: n, start: pos, end: pos + len });
      pos += len;
    }
    segs.total = pos;
    return segs;
  }
  function segsText(segs) { return segs.map(function (s) { return s.node.data; }).join(''); }

  async function parseChapter(i) {
    var it = S.spine[i];
    var raw = await readText(it.path);
    if (raw == null) raw = '<html><body><p></p></body></html>';
    var doc = parseMarkup(raw);
    var body = doc.body || doc.documentElement;
    var refs = [];
    Array.prototype.slice.call(doc.querySelectorAll('link,style')).forEach(function (el) {
      if (el.namespaceURI !== XHTML) return;
      if (el.localName === 'style') refs.push({ text: el.textContent, base: it.path });
      else if (/stylesheet/i.test(el.getAttribute('rel') || '')) refs.push({ href: el.getAttribute('href'), base: it.path });
      el.parentNode.removeChild(el);
    });
    Array.prototype.slice.call(body.querySelectorAll('script,noscript,iframe,object,embed')).forEach(function (el) {
      el.parentNode.removeChild(el);
    });
    return { index: i, path: it.path, body: body, refs: refs, lang: doc.documentElement.getAttribute('xml:lang') || doc.documentElement.getAttribute('lang') || '', css: null };
  }

  async function rewriteCss(css, basePath) {
    css = css.replace(/@import[^;]*;/g, '');
    var re = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/g, m, seen = {}, jobs = [];
    while ((m = re.exec(css))) {
      if (seen[m[0]] || /^[a-z][a-z0-9+.-]*:/i.test(m[2])) continue;
      seen[m[0]] = 1;
      jobs.push({ full: m[0], rel: m[2] });
    }
    for (var k = 0; k < jobs.length; k++) {
      var p = resolvePath(basePath, jobs[k].rel);
      var uri = p && await dataUri(p);
      if (uri) css = css.split(jobs[k].full).join('url("' + uri + '")');
    }
    return css;
  }

  async function inlineChapter(ch) {
    ch.css = [];
    for (var r = 0; r < ch.refs.length; r++) {
      var ref = ch.refs[r], text, base;
      if (ref.href != null) {
        base = resolvePath(ref.base, ref.href);
        text = base && await readText(base);
      } else { text = ref.text; base = ref.base; }
      if (text) ch.css.push(await rewriteCss(text, base));
    }
    var imgs = Array.prototype.slice.call(ch.body.querySelectorAll('img,image'));
    for (var k = 0; k < imgs.length; k++) {
      var el = imgs[k];
      var src = el.localName === 'img' ? el.getAttribute('src')
        : (el.getAttributeNS(XLINK, 'href') || el.getAttribute('href'));
      var path = src && resolvePath(ch.path, src);
      var uri = path && await dataUri(path);
      if (!uri) continue;
      if (el.localName === 'img') { el.setAttribute('src', uri); el.removeAttribute('srcset'); }
      else { el.setAttribute('href', uri); el.setAttributeNS(XLINK, 'xlink:href', uri); }
    }
  }

  function mountChapter(ch) {
    var d = frame.contentDocument;
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    d.close();
    d.documentElement.setAttribute('dir', S.rtl ? 'rtl' : 'ltr');
    d.documentElement.setAttribute('lang', ch.lang || S.meta.language || '');
    ch.css.forEach(function (t) {
      var st = d.createElement('style');
      st.textContent = t;
      d.head.appendChild(st);
    });
    var app = d.createElement('style');
    app.id = 'app';
    d.head.appendChild(app);
    Array.prototype.forEach.call(ch.body.attributes, function (a) {
      if (a.name !== 'style' && a.name.indexOf('on') !== 0) d.body.setAttribute(a.name, a.value);
    });
    var holder = d.body;
    var scrollMode = S.settings.mode === 'scroll';
    if (scrollMode) {
      holder = d.createElement('div');
      holder.className = '__ch';
      holder.setAttribute('data-spine', ch.index);
      d.body.appendChild(holder);
    }
    Array.prototype.forEach.call(ch.body.childNodes, function (n) {
      holder.appendChild(d.importNode(n, true));
    });
    S.doc = d;
    S.win = frame.contentWindow;
    S.root = holder;
    S.sections = scrollMode ? [{ index: ch.index, el: holder }] : [];
    S.cssSeen = {};
    ch.css.forEach(function (t) { S.cssSeen[t] = true; });
    S.ghostDirty = true;
    refreshSegs();
    S.curText = segsText(S.segs);
    attachListeners(d);
  }

  function refreshSegs() {
    S.segs = collectSegs(rootEl());
    S.segMap = new Map();
    S.segs.forEach(function (s) { S.segMap.set(s.node, s); });
  }

  async function waitAssets() {
    var d = S.doc;
    var pending = Array.prototype.slice.call(d.images || []).filter(function (im) { return !im.complete; })
      .map(function (im) { return new Promise(function (r) { im.onload = im.onerror = r; }); });
    if (d.fonts && d.fonts.ready) pending.push(d.fonts.ready);
    if (pending.length) await Promise.race([Promise.all(pending), sleep(1500)]);
  }

  /* --------------------------------------------------------------- layout */

  function geometry() {
    var s = S.settings, W = window.innerWidth, H = window.innerHeight;
    var mx = s.marginX, ins = s.insets;
    var scroll = s.mode === 'scroll';
    var pageW = Math.max(120, W - 2 * mx), pageH = Math.max(120, H - ins.top - ins.bottom);
    var cols = 1;
    if (!scroll) cols = s.columns === 'auto' ? (pageW >= 640 ? 2 : 1) : (+s.columns === 2 ? 2 : 1);
    var colW = pageW;
    if (cols === 2) { colW = Math.floor((pageW - s.gap) / 2); pageW = colW * 2 + s.gap; }
    return { W: W, H: H, mx: mx, top: ins.top, gap: s.gap, pageW: pageW, pageH: pageH, cols: cols, colW: colW, scroll: scroll, mode: s.mode };
  }

  function appCss(G) {
    var s = S.settings;
    var ff = s.fontFamily && s.fontFamily !== 'original' ? s.fontFamily : null;
    var dir = S.rtl ? 'rtl' : 'ltr';
    var css = [
      'html{margin:0!important;padding:0!important;background:' + s.bg + '!important;-webkit-text-size-adjust:none;direction:' + dir + '!important;' +
        (G.scroll ? 'overflow-x:hidden!important;overflow-y:scroll!important;touch-action:pan-y;overflow-anchor:none;' : 'overflow:hidden!important;touch-action:none;') + '}',
      'html::-webkit-scrollbar{display:none}',
      'body{margin:0!important;padding:0!important;border:0!important;width:' + G.pageW + 'px!important;max-width:none!important;min-width:0!important;' +
        (G.scroll ? 'height:auto!important;'
          : 'height:' + G.pageH + 'px!important;column-width:' + G.colW + 'px!important;-webkit-column-width:' + G.colW + 'px!important;column-gap:' + G.gap + 'px!important;-webkit-column-gap:' + G.gap + 'px!important;column-fill:auto!important;overflow:hidden!important;') +
        'color:' + s.fg + '!important;background:transparent!important;font-size:' + s.fontSize + 'px!important;line-height:' + s.lineHeight + '!important;direction:' + dir + '!important;' +
        (ff ? 'font-family:' + ff + '!important;' : '') +
        (s.justify ? 'text-align:justify!important;hyphens:auto;-webkit-hyphens:auto;' : '') +
        (s.bold ? 'font-weight:600!important;' : '') +
        (s.letterSpacing ? 'letter-spacing:' + s.letterSpacing + 'em!important;' : '') +
        (s.wordSpacing ? 'word-spacing:' + s.wordSpacing + 'em!important;' : '') +
        '-webkit-touch-callout:none;-webkit-user-select:text;user-select:text;overflow-wrap:break-word;word-wrap:break-word}',
      'body *{color:inherit!important;background-color:transparent!important;' + (ff ? 'font-family:inherit!important;' : '') + (s.bold ? 'font-weight:inherit;' : '') + 'box-sizing:border-box}',
      'body a,body a *{color:' + s.link + '!important}',
      'body img,body svg,body video{max-width:100%!important;max-height:' + G.pageH + 'px!important;object-fit:contain;break-inside:avoid}',
      'body img{height:auto}',
      'body h1,body h2,body h3,body h4{break-after:avoid;-webkit-column-break-after:avoid}',
      'body table{max-width:100%}',
      '::selection{background:rgba(10,132,255,.3)}',
      'mark{color:inherit!important;border-radius:2px;padding:0!important}'
    ];
    Object.keys(HL_COLORS).forEach(function (c) {
      css.push('body mark.hl-' + c + '{background-color:' + HL_COLORS[c][0] + '!important}');
      css.push('body mark.ul-' + c + '{background-color:transparent!important;border-bottom:2px solid ' + HL_COLORS[c][1] + ';border-radius:0}');
    });
    css.push('body mark.hit{background-color:rgba(255,149,0,.5)!important}');
    return css.join('\n');
  }

  function place(el, G) {
    el.style.left = G.mx + 'px';
    el.style.top = G.top + 'px';
    el.style.width = G.pageW + 'px';
    el.style.height = G.pageH + 'px';
  }

  function layout() {
    var G = S.G = geometry(), s = S.settings, d = S.doc;
    d.getElementById('app').textContent = appCss(G);
    place(frame, G);
    place(ghost, G);
    placeCurl(G);
    document.documentElement.style.setProperty('--bg', s.bg);
    document.body.style.background = s.bg;
    hdr.style.top = Math.max(10, G.top - 34) + 'px';
    ftr.style.bottom = Math.max(10, s.insets.bottom - 34) + 'px';
    hdr.style.color = ftr.style.color = s.fg;
    hdr.style.display = s.showHeader ? '' : 'none';
    ftr.style.display = s.showFooter ? '' : 'none';
    var b = d.body;
    var prev = b.style.transform;
    b.style.transition = 'none';
    b.style.transform = 'none';
    if (G.scroll) {
      S.pageCount = Math.max(1, Math.ceil(rootEl().offsetHeight / G.pageH - 0.02));
    } else {
      var step = G.pageW + G.gap;
      S.pageCount = Math.max(1, Math.ceil((d.body.scrollWidth + G.gap) / step - 0.01));
    }
    b.style.transform = prev;
    S.pageStarts = {};
    S.ghostDirty = true;
    scheduleGhost();
    if (G.scroll) scheduleExtras(); else clearExtras();
  }

  function autoLabels() {
    if (S.labelsExternal) return;
    hdr.textContent = chapterTitle(S.cur);
    ftr.textContent = (S.page + 1) + ' / ' + S.pageCount;
  }

  function showPage(p, animate) {
    p = clamp(p, 0, S.pageCount - 1);
    S.page = p;
    var G = S.G, b = S.doc.body;
    if (G.scroll) {
      b.style.transition = 'none';
      b.style.transform = 'none';
      S.win.scrollTo({ top: bodyTop() + p * G.pageH, behavior: animate ? 'smooth' : 'auto' });
    } else {
      scrollTo(S.doc.body, pageX(p), animate);
    }
    autoLabels();
  }

  // horizontal scroll position of page p (negative in right-to-left documents)
  function pageX(p) {
    return (S.rtl ? -1 : 1) * p * (S.G.pageW + S.G.gap);
  }

  function currentX() {
    return S.doc.body.scrollLeft;
  }

  var scrollAnim = 0;
  // scroll an element horizontally, optionally with a short ease-out animation
  function scrollTo(el, x, animate) {
    var id = ++scrollAnim;
    if (!animate) { el.scrollLeft = x; return; }
    var from = el.scrollLeft, t0 = null, dur = 240;
    function step(ts) {
      if (id !== scrollAnim) return;
      if (t0 == null) t0 = ts;
      var t = Math.min(1, (ts - t0) / dur);
      el.scrollLeft = from + (x - from) * (1 - Math.pow(1 - t, 3));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    setTimeout(function () { if (id === scrollAnim) el.scrollLeft = x; }, dur + 80);
  }

  /* ----------------------------------------- ghost iframe: curl and fade */

  var ghostTimer;
  function scheduleGhost() {
    clearTimeout(ghostTimer);
    if (!S.G || S.G.scroll) return;
    ghostTimer = setTimeout(function () { if (S.ghostDirty && S.doc && !S.ghostLock) buildGhost(); }, 250);
  }

  function buildGhost() {
    if (S.ghostLock) return;
    buildInto(ghost);
    var g2 = document.getElementById("ghost2");
    if (g2) buildInto(g2);
    S.ghostDirty = false;
  }

  function buildInto(frameEl) {
    var src = S.doc, g = frameEl.contentDocument;
    g.open();
    g.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    g.close();
    g.documentElement.setAttribute('dir', S.rtl ? 'rtl' : 'ltr');
    Array.prototype.forEach.call(src.head.querySelectorAll('style'), function (st) {
      var c = g.createElement('style');
      c.textContent = st.textContent;
      g.head.appendChild(c);
    });
    Array.prototype.forEach.call(src.body.attributes, function (a) {
      if (a.name !== 'style') g.body.setAttribute(a.name, a.value);
    });
    Array.prototype.forEach.call(src.body.childNodes, function (n) {
      g.body.appendChild(g.importNode(n, true));
    });
    S.ghostDirty = false;
  }

  function setGhostPage(p) {
    ghost.contentDocument.body.scrollLeft = pageX(p);
  }

  // Animate from the current page to `to` using the ghost. Resolves when finished.
  function turn(to, forward) {
    if (S.G.mode === 'curl') return curlTurn(to, forward);
    var from = S.page, kind = S.G.mode;
    return new Promise(function (resolve) {
      if (S.ghostDirty) buildGhost();
      syncLabels(oldPage);
      var angle = (S.rtl ? 1 : -1) * 90, dur = kind === 'fade' ? 180 : 420;
      oldPage.style.transition = 'none';
      oldPage.style.transformOrigin = S.rtl ? 'right center' : 'left center';
      oldPage.style.boxShadow = 'none';
      oldPage.style.visibility = 'visible';
      function finish() {
        oldPage.style.visibility = 'hidden';
        oldPage.style.transition = 'none';
        oldPage.style.transform = 'none';
        oldPage.style.opacity = '1';
        oldPage.style.boxShadow = 'none';
        resolve();
      }
      if (forward) {
        // old page lifts away over the new one
        setGhostPage(from);
        showPage(to, false);
        oldPage.style.opacity = '1';
        oldPage.style.transform = 'perspective(1600px) rotateY(0deg)';
        void oldPage.offsetWidth;
        if (kind === 'fade') {
          oldPage.style.transition = 'opacity ' + dur + 'ms ease';
          oldPage.style.opacity = '0';
        } else {
          oldPage.style.transition = 'transform ' + dur + 'ms cubic-bezier(.45,.05,.55,.95), box-shadow ' + dur + 'ms';
          oldPage.style.boxShadow = '0 0 38px rgba(0,0,0,.45)';
          oldPage.style.transform = 'perspective(1600px) rotateY(' + angle + 'deg)';
        }
        setTimeout(finish, dur + 30);
      } else {
        // previous page falls back over the current one
        setGhostPage(to);
        if (kind === 'fade') {
          oldPage.style.opacity = '0';
          oldPage.style.transform = 'none';
        } else {
          oldPage.style.transform = 'perspective(1600px) rotateY(' + angle + 'deg)';
          oldPage.style.boxShadow = '0 0 38px rgba(0,0,0,.45)';
        }
        void oldPage.offsetWidth;
        if (kind === 'fade') {
          oldPage.style.transition = 'opacity ' + dur + 'ms ease';
          oldPage.style.opacity = '1';
        } else {
          oldPage.style.transition = 'transform ' + dur + 'ms cubic-bezier(.45,.05,.55,.95)';
          oldPage.style.transform = 'perspective(1600px) rotateY(0deg)';
        }
        setTimeout(function () { showPage(to, false); finish(); }, dur + 30);
      }
    });
  }


  /* ---------------------------------------------------- page curl (corner fold) */
  // The whole screen is the page. A corner A is dragged to F. The fold line is the perpendicular
  // bisector of A-F:
  //  - the part of the old page on the far side stays flat (oldPage, clipped to a polygon),
  //  - the part on A's side is mirrored across the fold line and drawn as the back of the page (flap),
  //  - the next page shows underneath (the real frame).
  // Page corners are rounded like the device screen.
  var oldPage = document.getElementById('oldPage');
  var curlBox = document.getElementById('curlBox');
  var flap = document.getElementById('flap');
  var flapClip = document.getElementById('flapClip');
  var flapBack = document.getElementById('flapBack');
  var foldShade = document.getElementById('foldShade');
  var ghost2 = document.getElementById('ghost2');
  var curlBusy = false;

  function shade(hex, amt) {
    var v = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
    return 'rgb(' + v.map(function (c) { return Math.max(0, Math.min(255, Math.round(c + c * amt))); }).join(',') + ')';
  }

  function placeCurl(G) {
    var bg = S.settings.bg;
    [oldPage, curlBox, flap, flapClip, flapBack].forEach(function (el) {
      el.style.left = '0px';
      el.style.top = '0px';
      el.style.width = G.W + 'px';
      el.style.height = G.H + 'px';
    });
    oldPage.style.backgroundColor = bg;
    // the text iframes sit inside the page at the text position
    place(ghost2, G);
  }

  // running header / footer are part of the page, so they curl with it
  function syncLabels(c) {
    if (!c._lbl) {
      c._lbl = [document.createElement('div'), document.createElement('div')];
      c._lbl.forEach(function (e) { e.className = 'lbl'; c.appendChild(e); });
    }
    c._lbl[0].textContent = hdr.textContent;
    c._lbl[0].style.top = hdr.style.top || '20px';
    c._lbl[0].style.color = hdr.style.color;
    c._lbl[0].style.display = hdr.style.display;
    c._lbl[1].textContent = ftr.textContent;
    c._lbl[1].style.bottom = ftr.style.bottom || '20px';
    c._lbl[1].style.color = ftr.style.color;
    c._lbl[1].style.display = ftr.style.display;
  }

  // keep the part of a convex polygon on one side of the line through M with normal n
  function clipPoly(poly, M, n, keepNegative) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      var sp = (p.x - M.x) * n.x + (p.y - M.y) * n.y, sq = (q.x - M.x) * n.x + (q.y - M.y) * n.y;
      var inP = keepNegative ? sp <= 0 : sp >= 0, inQ = keepNegative ? sq <= 0 : sq >= 0;
      if (inP) out.push(p);
      if (inP !== inQ) {
        var t = sp / (sp - sq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
    return out;
  }
  function polyCss(pts) {
    if (pts.length < 3) return 'polygon(0px 0px,0px 0px,0px 0px)';
    return 'polygon(' + pts.map(function (p) { return p.x.toFixed(1) + 'px ' + p.y.toFixed(1) + 'px'; }).join(',') + ')';
  }

  function setGhostPages(p) {
    setGhostPage(p);
    ghost2.contentDocument.body.scrollLeft = pageX(p);
  }

  // Where the dragged corner is for progress q (0 = flat page, 1 = page turned over).
  // The corner first lifts up and across, then sweeps over the page: a diagonal fold that straightens out.
  function curlCorner(st, q) {
    var G = S.G, H = G.H;
    var lift = 0.3 * H * Math.sin(Math.PI * Math.min(1, q));
    return {
      x: st.A.x + (st.E.x - st.A.x) * q,
      y: st.A.y + (st.A.y > H / 2 ? -lift : lift)
    };
  }

  function curlBegin(to, forward, touchY, raw) {
    var G = S.G, W = G.W, H = G.H, rtl = S.rtl, from = S.page;
    if (!raw) {
      if (S.ghostDirty) buildGhost();
      if (forward) { setGhostPages(from); showPage(to, false); } else { setGhostPages(to); }
    }
    var bottom = touchY == null ? true : touchY > H / 2;
    var st = {
      from: from, to: to, forward: forward, p: 0,
      A: { x: rtl ? 0 : W, y: bottom ? H : 0 },
      E: { x: rtl ? 2 * W : -W, y: bottom ? H : 0 }
    };
    syncLabels(oldPage);
    syncLabels(flapClip);
    oldPage.style.visibility = 'visible';
    oldPage.style.transition = 'none';
    oldPage.style.transform = 'none';
    oldPage.style.opacity = '1';
    oldPage.style.boxShadow = 'none';
    curlBox.style.visibility = 'visible';
    flapBack.style.backgroundColor = shade(S.settings.bg, -0.08);
    ghost2.style.opacity = '0.32';
    foldShade.style.background = 'linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,.16) 20px, rgba(0,0,0,.42) 25px, rgba(0,0,0,.14) 40px, rgba(0,0,0,0) 90px)';
    hdr.style.visibility = 'hidden';
    ftr.style.visibility = 'hidden';
    curlBusy = true;
    return st;
  }

  // p: 0 = start of the turn, 1 = finished (for a backward turn the same curl is played in reverse)
  function curlApply(st, p) {
    var G = S.G, W = G.W, H = G.H;
    var q = st.forward ? p : 1 - p;
    var F = curlCorner(st, q), A = st.A;
    var dx = F.x - A.x, dy = F.y - A.y, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1.5) {
      oldPage.style.clipPath = 'none';
      oldPage.style.webkitClipPath = 'none';
      flapClip.style.clipPath = 'polygon(0px 0px,0px 0px,0px 0px)';
      foldShade.style.display = 'none';
      return;
    }
    var n = { x: dx / dist, y: dy / dist }, M = { x: (A.x + F.x) / 2, y: (A.y + F.y) / 2 };
    var rect = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    var flat = polyCss(clipPoly(rect, M, n, false));
    oldPage.style.clipPath = flat;
    oldPage.style.webkitClipPath = flat;
    var fold = polyCss(clipPoly(rect, M, n, true));
    flapClip.style.clipPath = fold;
    flapClip.style.webkitClipPath = fold;
    var mn = M.x * n.x + M.y * n.y;
    flap.style.transform = 'matrix(' + [1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.y, 1 - 2 * n.y * n.y, 2 * mn * n.x, 2 * mn * n.y].join(',') + ')';
    // shading strip centred on the fold line; local +y points towards the corner A
    var angle = Math.atan2(n.x, -n.y); // direction of the fold line (perpendicular to n)
    var L = 2 * (W + H);
    foldShade.style.display = 'block';
    foldShade.style.width = L + 'px';
    foldShade.style.height = '90px';
    foldShade.style.transform = 'translate(' + M.x + 'px,' + M.y + 'px) rotate(' + angle + 'rad) translate(' + (-L / 2) + 'px,-25px)';
  }

  function curlHide() {
    oldPage.style.visibility = 'hidden';
    oldPage.style.clipPath = 'none';
    oldPage.style.webkitClipPath = 'none';
    curlBox.style.visibility = 'hidden';
    hdr.style.visibility = '';
    ftr.style.visibility = '';
    curlBusy = false;
  }

  function curlEnd(st, commit) {
    curlHide();
    if (st.forward && !commit) showPage(st.from, false);
    if (!st.forward && commit) showPage(st.to, false);
    curlBusy = false;
  }

  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function curlAnimate(st, p0, p1, dur) {
    return new Promise(function (resolve) {
      var t0 = null, done = false;
      function finish() { if (!done) { done = true; resolve(); } }
      function step(ts) {
        if (done) return;
        if (t0 == null) t0 = ts;
        var t = Math.min(1, (ts - t0) / dur);
        st.p = p0 + (p1 - p0) * easeInOutCubic(t);
        curlApply(st, st.p);
        if (t < 1) requestAnimationFrame(step); else finish();
      }
      curlApply(st, p0);
      requestAnimationFrame(step);
      setTimeout(function () { if (done) return; st.p = p1; curlApply(st, p1); finish(); }, dur + 400);
    });
  }

  async function curlTurn(to, forward) {
    post('pageTurn', { mode: 'curl' });
    if (S.ghostDirty) {
      buildGhost();
      var fonts = [ghost, ghost2].map(function (g) { return g.contentDocument.fonts && g.contentDocument.fonts.ready; }).filter(Boolean);
      if (fonts.length) await Promise.race([Promise.all(fonts), sleep(400)]);
    }
    var st = curlBegin(to, forward, null);
    await curlAnimate(st, 0, 1, 900);
    curlEnd(st, true);
  }

  // finger-follow: called from touchmove while dragging in curl mode
  function curlDrag(t0, dx) {
    if (t0.curl === undefined) {
      var forward = S.rtl ? dx > 0 : dx < 0;
      var to = S.page + (forward ? 1 : -1);
      t0.curl = to >= 0 && to < S.pageCount && !curlBusy ? curlBegin(to, forward, t0.y + S.G.top) : null;
    }
    if (t0.curl) {
      t0.curl.p = Math.min(1, Math.abs(dx) / (S.G.W * 0.95));
      curlApply(t0.curl, t0.curl.p);
    }
  }

  /* ----------------------------------------- curl across chapter boundaries */

  // write a chapter into one of the ghost iframes (used to show the previous chapter's last page)
  function mountInto(frameEl, ch) {
    var d = frameEl.contentDocument;
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    d.close();
    d.documentElement.setAttribute('dir', S.rtl ? 'rtl' : 'ltr');
    ch.css.forEach(function (t) {
      var st = d.createElement('style');
      st.textContent = t;
      d.head.appendChild(st);
    });
    var app = d.createElement('style');
    app.textContent = appCss(S.G);
    d.head.appendChild(app);
    Array.prototype.forEach.call(ch.body.attributes, function (a) {
      if (a.name !== 'style' && a.name.indexOf('on') !== 0) d.body.setAttribute(a.name, a.value);
    });
    Array.prototype.forEach.call(ch.body.childNodes, function (n) {
      d.body.appendChild(d.importNode(n, true));
    });
    return d;
  }

  async function loadGhostChapter(index, first) {
    var ch = await parseChapter(index);
    await inlineChapter(ch);
    var d1 = mountInto(ghost, ch);
    mountInto(ghost2, ch);
    var imgs = Array.prototype.slice.call(d1.images || []).filter(function (im) { return !im.complete; })
      .map(function (im) { return new Promise(function (r) { im.onload = im.onerror = r; }); });
    if (d1.fonts && d1.fonts.ready) imgs.push(d1.fonts.ready);
    if (imgs.length) await Promise.race([Promise.all(imgs), sleep(1500)]);
    var G = S.G, count = Math.max(1, Math.ceil((d1.body.scrollWidth + G.gap) / (G.pageW + G.gap) - 0.01));
    setGhostPages(first ? 0 : count - 1);
  }

  // Turn from the last page of a chapter to the first of the next (forward), or the reverse.
  async function curlChapter(index, forward) {
    post('pageTurn', { mode: 'curl' });
    S.ghostLock = true;
    try {
      var st;
      if (forward) {
        if (S.ghostDirty) { S.ghostLock = false; buildGhost(); S.ghostLock = true; }
        setGhostPages(S.page);
        st = curlBegin(index, true, null, true);
        curlApply(st, 0);
        await renderChapter(index, 'start'); // the new chapter loads underneath the old page
        await curlAnimate(st, 0, 1, 900);
        curlHide();
      } else {
        await loadGhostChapter(index); // previous chapter's last page goes into the ghosts
        st = curlBegin(index, false, null, true);
        curlApply(st, 0);
        await curlAnimate(st, 0, 1, 900);
        await renderChapter(index, 'end'); // load it underneath, then drop the cover
        curlHide();
      }
    } finally {
      S.ghostLock = false;
      S.ghostDirty = true;
      scheduleGhost();
    }
  }

  /* ----------------------------------------------- slide: a sheet laid over another */
  // Forward: the next page slides in over the current one (which moves back a little).
  // Backward: the current page slides off and reveals the previous one underneath.
  // The moving sheet is the ghost layer (a copy of the page); the real frame is the page underneath.
  var slideBusy = false;

  function slideBegin(to, forward, raw) {
    var G = S.G, sign = S.rtl ? -1 : 1;
    var st = { from: S.page, to: to, forward: forward, sign: sign, p: 0 };
    if (!raw) {
      if (S.ghostDirty) buildGhost();
      if (forward) setGhostPage(to);
      else { setGhostPage(S.page); showPage(to, false); }
    }
    syncLabels(oldPage);
    oldPage.style.clipPath = 'none';
    oldPage.style.webkitClipPath = 'none';
    oldPage.style.transition = 'none';
    oldPage.style.opacity = '1';
    oldPage.style.boxShadow = (sign > 0 ? '-14px' : '14px') + ' 0 32px rgba(0,0,0,.38)';
    oldPage.style.visibility = 'visible';
    hdr.style.visibility = 'hidden';
    ftr.style.visibility = 'hidden';
    slideBusy = true;
    slideApply(st, 0);
    return st;
  }

  // p: 0 = start of the turn, 1 = finished
  function slideApply(st, p) {
    var W = S.G.W;
    var sheet = st.forward ? st.sign * W * (1 - p) : st.sign * W * p;
    var under = st.forward ? -st.sign * W * 0.22 * p : -st.sign * W * 0.22 * (1 - p);
    oldPage.style.transform = 'translate3d(' + sheet.toFixed(1) + 'px,0,0)';
    frame.style.transform = 'translate3d(' + under.toFixed(1) + 'px,0,0)';
  }

  function slideHide() {
    oldPage.style.visibility = 'hidden';
    oldPage.style.transform = 'none';
    oldPage.style.boxShadow = 'none';
    frame.style.transform = 'none';
    hdr.style.visibility = '';
    ftr.style.visibility = '';
    slideBusy = false;
  }

  function slideEnd(st, commit) {
    slideHide();
    if (st.forward && commit) showPage(st.to, false);
    if (!st.forward && !commit) showPage(st.from, false);
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function slideAnimate(st, p0, p1, dur) {
    return new Promise(function (resolve) {
      var t0 = null, done = false;
      function finish() { if (!done) { done = true; resolve(); } }
      function step(ts) {
        if (done) return;
        if (t0 == null) t0 = ts;
        var t = Math.min(1, (ts - t0) / dur);
        st.p = p0 + (p1 - p0) * easeOutCubic(t);
        slideApply(st, st.p);
        if (t < 1) requestAnimationFrame(step); else finish();
      }
      requestAnimationFrame(step);
      setTimeout(function () { if (done) return; st.p = p1; slideApply(st, p1); finish(); }, dur + 300);
    });
  }

  async function slideTurn(to, forward) {
    post('pageTurn', { mode: 'slide' });
    if (S.ghostDirty) {
      buildGhost();
      var fonts = [ghost].map(function (g) { return g.contentDocument.fonts && g.contentDocument.fonts.ready; }).filter(Boolean);
      if (fonts.length) await Promise.race([Promise.all(fonts), sleep(300)]);
    }
    var st = slideBegin(to, forward, false);
    await slideAnimate(st, 0, 1, 420);
    slideEnd(st, true);
  }

  // finger-follow: called from touchmove while dragging in slide mode
  function slideDrag(t0, dx) {
    if (t0.slide === undefined) {
      var forward = S.rtl ? dx > 0 : dx < 0;
      var to = S.page + (forward ? 1 : -1);
      t0.slide = to >= 0 && to < S.pageCount && !slideBusy && !curlBusy ? slideBegin(to, forward, false) : null;
    }
    if (t0.slide) {
      t0.slide.p = Math.min(1, Math.abs(dx) / (S.G.W * 0.9));
      slideApply(t0.slide, t0.slide.p);
    }
  }

  // Slide across a chapter boundary
  async function slideChapter(index, forward) {
    post('pageTurn', { mode: 'slide' });
    S.ghostLock = true;
    try {
      var st;
      if (forward) {
        await loadGhostChapter(index, true); // first page of the next chapter is the sheet that slides in
        st = slideBegin(index, true, true);
        await slideAnimate(st, 0, 1, 420);
        await renderChapter(index, 'start');
        slideHide();
      } else {
        if (S.ghostDirty) { S.ghostLock = false; buildGhost(); S.ghostLock = true; }
        setGhostPages(S.page); // the current page is the sheet that slides off
        st = slideBegin(index, false, true);
        await renderChapter(index, 'end'); // previous chapter underneath
        await slideAnimate(st, 0, 1, 420);
        slideHide();
      }
    } finally {
      S.ghostLock = false;
      S.ghostDirty = true;
      scheduleGhost();
    }
  }

  /* --------------------------------------------- continuous scrolling (Scroll mode) */
  // Chapters are stacked as sections inside the body; the next ones are loaded below the current one and the
  // previous one above it. Nothing is moved or rewritten while the user scrolls: "current chapter" simply
  // follows the middle of the screen (the page offsets are measured against that chapter's own section).

  function rootEl() { return S.root || S.doc.body; }

  function bodyTop() {
    var d = S.doc, el = d.scrollingElement || d.documentElement;
    return rootEl().getBoundingClientRect().top + el.scrollTop;
  }

  function clearExtras() { /* switching mode re-renders the chapter, so there is nothing to remove */ }

  function applyHighlightsFor(el, index) {
    S.root = el;
    refreshSegs();
    S.highlights.filter(function (h) { return h.spine === index; })
      .sort(function (x, y) { return x.start - y.start; })
      .forEach(function (h) {
        var color = HL_COLORS[h.color] ? h.color : 'yellow';
        wrapRange(h.start, h.end, (h.style === 'underline' ? 'ul-' : 'hl-') + color, h.id);
      });
  }

  async function mountExtra(index, where) {
    var token = S.token;
    var ch = await parseChapter(index);
    await inlineChapter(ch);
    if (token !== S.token || !S.doc || !S.G.scroll) return;
    if (S.sections.some(function (x) { return x.index === index; })) return;
    var d = S.doc, el = d.createElement('div');
    el.className = '__ch';
    el.setAttribute('data-spine', index);
    Array.prototype.forEach.call(ch.body.childNodes, function (n) { el.appendChild(d.importNode(n, true)); });
    ch.css.forEach(function (t) {
      if (S.cssSeen[t]) return;
      S.cssSeen[t] = true;
      var st = d.createElement('style');
      st.textContent = t;
      d.head.insertBefore(st, d.getElementById('app')); // before the app style so the theme still wins
    });
    var sc = d.scrollingElement || d.documentElement, cur = S.root;
    if (where === 'tail') {
      d.body.appendChild(el);
      S.sections.push({ index: index, el: el });
    } else {
      d.body.insertBefore(el, S.sections[0].el);
      S.sections.unshift({ index: index, el: el });
      sc.scrollTop += el.offsetHeight; // keep what is on screen where it is
    }
    applyHighlightsFor(el, index);
    S.root = cur;
    refreshSegs();
  }

  async function ensureExtras() {
    if (!S.doc || !S.G || !S.G.scroll || S.extraBusy || !S.sections || !S.sections.length) return;
    S.extraBusy = true;
    try {
      var last = S.sections[S.sections.length - 1].index;
      if (last < S.spine.length - 1 && last - S.cur < 2) await mountExtra(last + 1, 'tail');
      var first = S.sections[0].index;
      if (first > 0 && S.cur - first < 1) await mountExtra(first - 1, 'head');
    } catch (e) { /* neighbours are optional */ } finally { S.extraBusy = false; }
  }

  var extrasTimer;
  function scheduleExtras() {
    clearTimeout(extrasTimer);
    extrasTimer = setTimeout(ensureExtras, 350);
  }

  // follow the middle of the screen; true when the current chapter changed
  function checkSection() {
    var d = S.doc;
    if (!d || !S.G.scroll || !S.sections || !S.sections.length) return false;
    var sc = d.scrollingElement || d.documentElement, mid = sc.scrollTop + S.G.pageH / 2;
    for (var i = 0; i < S.sections.length; i++) {
      var sec = S.sections[i], r = sec.el.getBoundingClientRect(), top = r.top + sc.scrollTop;
      if (mid >= top && mid < top + r.height) {
        if (sec.index === S.cur) return false;
        setCurrentSection(sec);
        return true;
      }
    }
    return false;
  }

  function setCurrentSection(sec) {
    var d = S.doc, sc = d.scrollingElement || d.documentElement;
    S.cur = sec.index;
    S.root = sec.el;
    refreshSegs();
    S.curText = segsText(S.segs);
    S.pageStarts = {};
    S.pageCount = Math.max(1, Math.ceil(sec.el.offsetHeight / S.G.pageH - 0.02));
    S.page = clamp(Math.round((sc.scrollTop - bodyTop()) / S.G.pageH), 0, S.pageCount - 1);
    autoLabels();
    relocate();
    scheduleExtras();
  }

  async function goPage(to, forward) {
    var G = S.G;
    if (G.scroll) showPage(to, true);
    else if (G.mode === 'curl' || G.mode === 'fade') await turn(to, forward);
    else if (G.mode === 'slide') await slideTurn(to, forward);
    else showPage(to, true);
  }

  /* -------------------------------------------- offset <-> page geometry */

  function segFor(o) {
    var lo = 0, hi = S.segs.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, s = S.segs[mid];
      if (o < s.start) hi = mid - 1;
      else if (o >= s.end) lo = mid + 1;
      else return { node: s.node, pos: o - s.start };
    }
    return null;
  }

  function pageOfRect(r) {
    var G = S.G, b = (G.scroll ? rootEl() : S.doc.body).getBoundingClientRect();
    if (G.scroll) return Math.floor((r.top - b.top + 2) / G.pageH);
    var sl = S.doc.body.scrollLeft;
    var rel = S.rtl ? b.right - r.right - sl : r.left - b.left + sl;
    return Math.floor((rel + 2) / (G.pageW + G.gap));
  }

  // page of the first renderable character at or after offset o (Infinity if none nearby)
  function pageAt(o) {
    var total = S.segs.total, end = Math.min(o + 400, total);
    for (var k = Math.max(0, o); k < end; k++) {
      var loc = segFor(k);
      if (!loc) continue;
      var r = S.doc.createRange();
      r.setStart(loc.node, loc.pos);
      r.setEnd(loc.node, loc.pos + 1);
      var rects = r.getClientRects();
      if (rects.length && rects[0].width + rects[0].height > 0) return pageOfRect(rects[0]);
    }
    return Infinity;
  }

  function pageStart(p) {
    var total = S.segs.total;
    if (p <= 0) return 0;
    if (p >= S.pageCount) return total;
    if (S.pageStarts[p] != null) return S.pageStarts[p];
    var lo = 0, hi = total;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (pageAt(mid) >= p) hi = mid; else lo = mid + 1;
    }
    return (S.pageStarts[p] = lo);
  }

  function pageForOffset(o) {
    var p = pageAt(o);
    return p === Infinity ? S.pageCount - 1 : clamp(p, 0, S.pageCount - 1);
  }

  function boundaryOffset(node, off) {
    if (node.nodeType === 3) {
      var s = S.segMap.get(node);
      return s ? s.start + off : 0;
    }
    var ref = node.childNodes[off], pred;
    if (ref) {
      pred = function (sn) { return sn === ref || (ref.compareDocumentPosition(sn) & 4) !== 0; };
    } else {
      pred = function (sn) {
        var c = node.compareDocumentPosition(sn);
        return (c & 4) !== 0 && (c & 16) === 0;
      };
    }
    var lo = 0, hi = S.segs.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (pred(S.segs[mid].node)) hi = mid; else lo = mid + 1;
    }
    return lo < S.segs.length ? S.segs[lo].start : S.segs.total;
  }

  function rectOf(x) {
    var r = x.getBoundingClientRect();
    return { x: r.left + frame.offsetLeft, y: r.top + frame.offsetTop, width: r.width, height: r.height };
  }

  /* ------------------------------------------------------------- progress */

  function bookProgress(offset) {
    if (S.indexed && S.totalLen > 0) return clamp((S.cum[S.cur] + offset) / S.totalLen, 0, 1);
    return clamp((S.cur + S.page / S.pageCount) / S.spine.length, 0, 1);
  }

  function relocate() {
    var start = pageStart(S.page);
    var end = S.page + 1 >= S.pageCount ? S.segs.total : pageStart(S.page + 1);
    post('relocate', {
      spine: S.cur, offset: start, end: end,
      page: S.page, pageCount: S.pageCount, spineCount: S.spine.length,
      textLength: S.segs.total,
      progress: bookProgress(start), chapter: chapterTitle(S.cur),
      excerpt: S.curText.slice(start, start + 120).replace(/\s+/g, ' ').trim(),
      indexed: S.indexed
    });
  }

  /* ----------------------------------------------------------- navigation */

  async function renderChapter(i, target) {
    i = clamp(i, 0, S.spine.length - 1);
    var token = ++S.token;
    clearHit(true);
    S.dataCache = {};
    var ch = await parseChapter(i);
    await inlineChapter(ch);
    if (token !== S.token) return;
    S.cur = i;
    S.sel = null;
    mountChapter(ch);
    await waitAssets();
    if (token !== S.token) return;
    layout();
    applyHighlightsDom();
    var p = 0;
    if (target === 'end') p = S.pageCount - 1;
    else if (target && target.offset != null) p = pageForOffset(target.offset);
    else if (target && target.fragment) p = pageOfFragment(target.fragment);
    showPage(p, false);
    relocate();
  }

  function pageOfFragment(id) {
    var d = S.doc;
    var el = d.getElementById(id) || d.getElementsByName(id)[0];
    if (!el) return 0;
    var r = el.getBoundingClientRect();
    return clamp(pageOfRect(r), 0, S.pageCount - 1);
  }

  async function next() {
    clearHit();
    if (S.page < S.pageCount - 1) { await goPage(S.page + 1, true); relocate(); }
    else if (S.cur < S.spine.length - 1) {
      if (S.G.mode === 'curl') await curlChapter(S.cur + 1, true);
      else if (S.G.mode === 'slide') await slideChapter(S.cur + 1, true);
      else await renderChapter(S.cur + 1, 'start');
    }
    else { showPage(S.page, true); post('end', { edge: 'end' }); }
  }
  async function prev() {
    clearHit();
    if (S.page > 0) { await goPage(S.page - 1, false); relocate(); }
    else if (S.cur > 0) {
      if (S.G.mode === 'curl') await curlChapter(S.cur - 1, false);
      else if (S.G.mode === 'slide') await slideChapter(S.cur - 1, false);
      else await renderChapter(S.cur - 1, 'end');
    }
    else { showPage(S.page, true); post('end', { edge: 'start' }); }
  }

  async function gotoLocation(loc) {
    loc = loc || {};
    if (loc.progress != null && loc.spine == null) return gotoProgress(loc.progress);
    var spine = loc.spine != null ? clamp(loc.spine, 0, S.spine.length - 1) : 0;
    var target = loc.fragment ? { fragment: loc.fragment } : { offset: loc.offset || 0 };
    if (spine === S.cur && S.doc) {
      clearHit();
      showPage(target.fragment ? pageOfFragment(target.fragment) : pageForOffset(target.offset), false);
      relocate();
    } else await renderChapter(spine, target);
  }

  async function gotoProgress(p) {
    p = clamp(p, 0, 1);
    if (!S.indexed) { await renderChapter(Math.floor(p * (S.spine.length - 1)), 'start'); return; }
    var t = p * S.totalLen, i = 0;
    while (i < S.spine.length - 1 && S.cum[i + 1] <= t) i++;
    await renderChapter(i, { offset: Math.floor(t - S.cum[i]) });
  }

  /* ---------------------------------------------------------- settings */

  function applySettings(partial) {
    var s = S.settings, dirBefore = s.direction;
    // anchor is measured with the layout that is still on screen
    var anchor = S.doc ? pageStart(S.page) : 0;
    Object.keys(partial || {}).forEach(function (k) {
      if (k === 'insets') s.insets = { top: partial.insets.top, bottom: partial.insets.bottom };
      else if (partial[k] != null) s[k] = partial[k];
    });
    if (s.direction !== dirBefore && S.spine.length) {
      var lang = S.meta.language.toLowerCase().split('-')[0];
      S.rtl = s.direction === 'rtl' ? true : s.direction === 'ltr' ? false : RTL_LANGS.indexOf(lang) >= 0;
      if (S.doc) { renderChapter(S.cur, { offset: anchor }); return; }
    }
    if (S.doc && S.G && S.G.scroll !== (s.mode === 'scroll')) {
      renderChapter(S.cur, { offset: anchor });
      return;
    }
    if (S.doc) {
      layout();
      showPage(pageForOffset(anchor), false);
      relocate();
    }
  }

  function relayout() {
    var anchor = pageStart(S.page);
    layout();
    showPage(pageForOffset(anchor), false);
    relocate();
  }

  /* ----------------------------------------------------------- highlights */

  function unwrapMarks(selector) {
    var marks = Array.prototype.slice.call(S.doc.querySelectorAll(selector));
    var parents = [];
    marks.forEach(function (m) {
      var p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      parents.push(p);
    });
    parents.forEach(function (p) { if (p.parentNode) p.normalize(); });
    return marks.length;
  }

  function wrapRange(a, b, cls, id) {
    var items = [];
    S.segs.forEach(function (seg) {
      if (seg.end <= a || seg.start >= b) return;
      var la = Math.max(a, seg.start) - seg.start, lb = Math.min(b, seg.end) - seg.start;
      if (lb <= la) return;
      if (!seg.node.data.slice(la, lb).trim()) {
        var disp = seg.node.parentNode && S.win.getComputedStyle(seg.node.parentNode).display;
        if (!disp || disp.indexOf('inline') !== 0) return;
      }
      items.push({ node: seg.node, la: la, lb: lb });
    });
    items.forEach(function (it) {
      var mid = it.node;
      if (it.la > 0) mid = mid.splitText(it.la);
      if (it.lb - it.la < mid.data.length) mid.splitText(it.lb - it.la);
      var m = S.doc.createElement('mark');
      m.className = cls;
      m.setAttribute('data-hl', id);
      mid.parentNode.insertBefore(m, mid);
      m.appendChild(mid);
    });
    refreshSegs();
  }

  function applyHighlightsDom() {
    unwrapMarks('mark[data-hl]:not(.hit)');
    var cur = S.root;
    if (S.sections && S.sections.length) S.sections.forEach(function (sec) { applyHighlightsFor(sec.el, sec.index); });
    else applyHighlightsFor(S.doc.body, S.cur);
    S.root = cur;
    refreshSegs();
    S.ghostDirty = true;
    scheduleGhost();
  }

  function showHit(offset, length) {
    clearHit(true);
    wrapRange(offset, offset + length, 'hit', '__hit');
  }
  function clearHit(skipRefresh) {
    if (!S.doc) return;
    if (unwrapMarks('mark.hit') && !skipRefresh) refreshSegs();
  }

  /* ------------------------------------------------------------- search */

  var FOLD = { 'ي': 'ی', 'ك': 'ک', 'ة': 'ه', 'ى': 'ی', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ۀ': 'ه', 'ہ': 'ه', 'ە': 'ه' };
  function fold(s) {
    return s.toLowerCase().replace(/[يكةىأإآۀہە]/g, function (c) { return FOLD[c]; });
  }

  async function search(query, id) {
    S.searchId = id;
    var q = fold(query.trim());
    if (q.length < 2) { post('searchResults', { id: id, results: [], done: true }); return; }
    while (!S.indexed) {
      if (S.searchId !== id) return;
      await sleep(80);
    }
    var total = 0;
    for (var i = 0; i < S.spine.length; i++) {
      if (S.searchId !== id) return;
      var text = S.texts[i], folded = fold(text), from = 0, found = [], at;
      while ((at = folded.indexOf(q, from)) >= 0 && total + found.length < 500) {
        found.push({
          spine: i, offset: at, length: q.length, chapter: chapterTitle(i),
          before: text.slice(Math.max(0, at - 40), at).replace(/\s+/g, ' '),
          match: text.slice(at, at + q.length),
          after: text.slice(at + q.length, at + q.length + 60).replace(/\s+/g, ' ')
        });
        from = at + q.length;
      }
      total += found.length;
      post('searchResults', { id: id, results: found, done: i === S.spine.length - 1 || total >= 500 });
      if (total >= 500) return;
      if (i % 4 === 3) await sleep(0);
    }
  }

  async function buildIndex() {
    var cum = 0, id = S.openId;
    var texts = [], cums = [];
    for (var i = 0; i < S.spine.length; i++) {
      var ch = await parseChapter(i);
      if (id !== S.openId) return;
      var t = segsText(collectSegs(ch.body));
      texts[i] = t; cums[i] = cum; cum += t.length;
      if (i % 3 === 2) await sleep(0);
    }
    if (id !== S.openId) return;
    S.texts = texts; S.cum = cums;
    S.totalLen = cum;
    S.indexed = true;
    post('indexed', { totalLength: cum, cum: S.cum });
    if (S.doc) relocate();
  }

  /* ------------------------------------------------------------- events */

  function handleLink(a) {
    var href = a.getAttribute('href') || '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) { post('link', { href: href }); return; }
    var frag = href.indexOf('#') >= 0 ? href.split('#')[1] : '';
    var host = a.closest && a.closest('.__ch');
    var path = resolvePath(S.spine[host ? +host.getAttribute('data-spine') : S.cur].path, href);
    var idx = path ? spineIndexOfPath(path) : -1;
    if (idx < 0) return;
    queue = queue.then(function () { return gotoLocation({ spine: idx, fragment: frag, offset: 0 }); });
  }

  function attachListeners(d) {
    d.addEventListener('click', function (e) {
      if (S.dragged) return;
      var sel = d.getSelection();
      if (sel && !sel.isCollapsed) return;
      var t = e.target, a = t.closest && t.closest('a'), m = t.closest && t.closest('mark[data-hl]');
      if (a) { e.preventDefault(); handleLink(a); return; }
      if (m && m.getAttribute('data-hl') !== '__hit') {
        post('highlightTap', { id: m.getAttribute('data-hl'), rect: rectOf(m) });
        return;
      }
      var x = (e.clientX + S.G.mx) / S.G.W;
      var zone = S.G.scroll || (x >= 0.25 && x <= 0.75) ? 'center' : (x < 0.25 ? 'left' : 'right');
      if (zone === 'center') { clearHit(); post('tap', { zone: 'center' }); return; }
      var forward = (zone === 'right') !== S.rtl;
      queue = queue.then(forward ? next : prev);
    }, true);

    var t0 = null;
    d.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { t0 = null; return; }
      var t = e.touches[0], el = d.scrollingElement || d.documentElement;
      t0 = { x: t.clientX, y: t.clientY, time: Date.now(), drag: false, dx: 0, dy: 0, base: currentX(), top: el.scrollTop };
    }, { passive: true });
    d.addEventListener('touchmove', function (e) {
      if (!t0) return;
      var sel = d.getSelection();
      if (sel && !sel.isCollapsed) { t0 = null; return; }
      var t = e.touches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y;
      t0.dx = dx; t0.dy = dy;
      if (S.G.scroll) return;
      if (!t0.drag) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) t0.drag = true; else return;
      }
      e.preventDefault();
      if (S.G.mode === 'slide') slideDrag(t0, dx);
      else if (S.G.mode === 'curl') curlDrag(t0, dx);
    }, { passive: false });
    d.addEventListener('touchend', function () {
      var tt = t0;
      t0 = null;
      if (!tt) return;
      var G = S.G;
      if (G.scroll) {
        // keep scrolling into the next/previous chapter when the edge is already reached
        var el = d.scrollingElement || d.documentElement;
        var still = Math.abs(el.scrollTop - tt.top) < 3;
        if (still && Math.abs(tt.dy) > 60) {
          if (tt.dy < 0 && el.scrollTop + G.pageH >= el.scrollHeight - 2) queue = queue.then(next);
          else if (tt.dy > 0 && el.scrollTop <= 1) queue = queue.then(prev);
        }
        return;
      }
      if (!tt.drag) return;
      if (tt.slide) {
        var ss = tt.slide;
        S.dragged = true;
        setTimeout(function () { S.dragged = false; }, 350);
        var sfast = Math.abs(tt.dx) / Math.max(1, Date.now() - tt.time) > 0.5 && Math.abs(tt.dx) > 30;
        var scommit = ss.p > 0.28 || sfast;
        if (scommit) post('pageTurn', { mode: 'slide' });
        queue = queue.then(async function () {
          await slideAnimate(ss, ss.p, scommit ? 1 : 0, scommit ? 140 + 280 * (1 - ss.p) : 120 + 220 * ss.p);
          slideEnd(ss, scommit);
          if (scommit) relocate();
        });
        return;
      }
      if (tt.curl) {
        var st = tt.curl;
        S.dragged = true;
        setTimeout(function () { S.dragged = false; }, 350);
        var fast = Math.abs(tt.dx) / Math.max(1, Date.now() - tt.time) > 0.5 && Math.abs(tt.dx) > 30;
        var commit = st.p > 0.3 || fast;
        if (commit) post('pageTurn', { mode: 'curl' });
        queue = queue.then(async function () {
          await curlAnimate(st, st.p, commit ? 1 : 0, commit ? 260 + 560 * (1 - st.p) : 200 + 300 * st.p);
          curlEnd(st, commit);
          if (commit) relocate();
        });
        return;
      }
      var dx = tt.dx, dt = Math.max(1, Date.now() - tt.time);
      var go = Math.abs(dx) > G.W * 0.2 || (Math.abs(dx) / dt > 0.5 && Math.abs(dx) > 30);
      S.dragged = true;
      setTimeout(function () { S.dragged = false; }, 350);
      if (!go) { if (G.mode === 'slide') showPage(S.page, true); return; }
      var forward = S.rtl ? dx > 0 : dx < 0;
      queue = queue.then(forward ? next : prev);
    }, { passive: true });

    d.defaultView.addEventListener('scroll', debounce(function () {
      if (d !== S.doc || !S.G.scroll) return;
      if (checkSection()) return;
      var el = d.scrollingElement || d.documentElement;
      var p = clamp(Math.round((el.scrollTop - bodyTop()) / S.G.pageH), 0, S.pageCount - 1);
      if (p !== S.page) { S.page = p; autoLabels(); relocate(); }
    }, 120));

    d.addEventListener('selectionchange', debounce(function () {
      if (d !== S.doc) return;
      var sel = d.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        if (S.sel) { S.sel = null; post('selectionClear'); }
        return;
      }
      var r = sel.getRangeAt(0);
      if (!rootEl().contains(r.startContainer) || !rootEl().contains(r.endContainer)) return;
      var a = boundaryOffset(r.startContainer, r.startOffset), b = boundaryOffset(r.endContainer, r.endOffset);
      if (b <= a) return;
      S.sel = { spine: S.cur, start: a, end: b, text: sel.toString() };
      post('selection', { spine: S.cur, start: a, end: b, text: S.sel.text, rect: rectOf(r) });
    }, 180));
  }

  /* ------------------------------------------------------------ commands */

  var queue = Promise.resolve();

  async function handle(c) {
    switch (c.cmd) {
      case 'open':
        S.openId = (S.openId || 0) + 1;
        S.token++;
        S.cur = -1;
        S.page = 0;
        S.pageCount = 1;
        S.doc = null;
        S.win = null;
        S.segs = [];
        S.curText = '';
        S.pageStarts = {};
        S.texts = [];
        S.cum = [];
        S.totalLen = 0;
        S.indexed = false;
        S.sel = null;
        S.searchId = -1;
        applySettings(c.settings);
        S.highlights = c.highlights || [];
        await openBook(c.data);
        buildIndex();
        post('loaded', { spineCount: S.spine.length });
        await gotoLocation(c.location);
        break;
      case 'settings': applySettings(c.settings); break;
      case 'labels':
        S.labelsExternal = true;
        hdr.textContent = c.header || '';
        ftr.textContent = c.footer || '';
        break;
      case 'highlights':
        S.highlights = c.list || [];
        if (S.doc) { applyHighlightsDom(); }
        break;
      case 'next': await next(); break;
      case 'prev': await prev(); break;
      case 'goto': await gotoLocation(c.location); break;
      case 'showHit': if (S.doc) showHit(c.offset, c.length); break;
      case 'clearSelection':
        if (S.doc) S.doc.getSelection().removeAllRanges();
        S.sel = null;
        break;
      case 'search': search(c.query, c.id); break;
      case 'cancelSearch': S.searchId = c.id || -1; break;
    }
  }

  window.__cmd = function (str) {
    var c;
    try { c = JSON.parse(str); } catch (e) { return; }
    queue = queue.then(function () { return handle(c); }).catch(function (err) {
      post('error', { message: String((err && err.message) || err) });
    });
  };
  window.addEventListener('message', function (e) { if (typeof e.data === 'string') window.__cmd(e.data); });
  document.addEventListener('message', function (e) { if (typeof e.data === 'string') window.__cmd(e.data); });
  window.addEventListener('resize', debounce(function () { if (S.doc) relayout(); }, 150));
  window.__reader = S; // debugging aid

  post('ready');
})();
