/* ================= KONFIG ================= */
const TARGET_URL = 'https://artikel-proxy.extra03-mine.workers.dev/';
const SITE_TITLE = 'Blog Udin';

/* ================= UTIL ================= */
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}

function parseDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/* ================= PARSER ORG ================= */
function parseOrg(text) {
  const articles = [];
  let cur = null, buf = [], drawer = false;

  const flush = () => {
    if (cur) {
      cur.raw = buf.join('\n').trim();
      cur.date = parseDate(cur.props.date || cur.props.tanggal) || parseDate((cur.raw.match(/^\s*[<\[](\d{4}-\d{2}-\d{2})/) || [])[1]);
      cur.slug = cur.props.slug || cur.props.id || slugify(cur.title);
      cur.layout = cur.props.layout || 'post';
      articles.push(cur);
    }
    buf = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\*+)\s+(.*)$/);
    if (m && m[1].length === 1) {
      flush();
      let t = m[2], tags = [];
      const tm = t.match(/^(.*?)\s+(:[\w@#:]+:)\s*$/);
      if (tm) { t = tm[1]; tags = tm[2].split(':').filter(Boolean); }
      cur = { title: t.trim(), tags, props: {} };
      continue;
    }
    if (!cur) continue;
    if (/^\s*:PROPERTIES:\s*$/i.test(line)) { drawer = true; continue; }
    if (drawer && /^\s*:END:\s*$/i.test(line)) { drawer = false; continue; }
    if (drawer) {
      const pm = line.match(/^\s*:([\w-]+):\s*(.*)$/);
      if (pm) cur.props[pm[1].toLowerCase()] = pm[2].trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  return articles;
}

/* ================= ORG -> HTML (BULLETPROOF) ================= */
function renderInline(s) {
  // 1. Escape HTML dulu untuk keamanan
  s = escapeHtml(s);

  // 2. Render YouTube
  s = s.replace(/\[\[youtube:([^\]]+)\]\[([^\]]+)\]\]/g, function(_, videoId, text) {
    return '<div class="youtube-embed"><iframe src="https://www.youtube.com/embed/' + videoId + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>';
  });

  // 3. Render Audio
  s = s.replace(/\[\[audio:([^\]]+)\]\[([^\]]+)\]\]/g, function(_, url, text) {
    return '<div class="audio-player"><audio controls style="width:100%;"><source src="' + url + '" type="audio/mp4"><source src="' + url + '" type="audio/mpeg">Browser tidak mendukung. <a href="' + url + '">Unduh</a>.</audio></div>';
  });

  // 4. Render Gambar dengan Teks: [[URL][Teks]]
  s = s.replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g, function(_, u, t) {
    const cleanUrl = u.trim();
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(cleanUrl)) {
      return '<img src="' + cleanUrl + '" alt="' + t + '" style="max-width:100%; height:auto; border-radius:4px; margin: 10px 0;">';
    }
    return '<a href="' + cleanUrl + '" target="_blank" rel="noopener">' + t + '</a>';
  });

  // 5. Render Gambar TANPA Teks: [[URL]]
  s = s.replace(/\[\[([^\]]+)\]\]/g, function(_, u) {
    const cleanUrl = u.trim();
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(cleanUrl)) {
      // Tambahkan console.log untuk memastikan ini berjalan
      console.log("Gambar terdeteksi:", cleanUrl);
      return '<img src="' + cleanUrl + '" alt="image" style="max-width:100%; height:auto; border-radius:4px; margin: 10px 0;">';
    }
    return '<a href="' + cleanUrl + '" target="_blank" rel="noopener">' + cleanUrl + '</a>';
  });

  // 6. Kode inline
  s = s.replace(/~([^~\n]+)~/g, '<code>$1</code>');
  s = s.replace(/=([^=\n]+)=/g, '<code>$1</code>');

  // 7. Format teks Org-mode
  s = s.replace(/(^|[\s('">])\*([^*\n]+?)\*(?=$|[\s.,;:!?)'"])/g, '$1<strong>$2</strong>');
  s = s.replace(/(^|[\s('">])\/([^\/\n]+?)\/(?=$|[\s.,;:!?)'"])/g, '$1<em>$2</em>');
  s = s.replace(/(^|[\s('">])_([^_\n]+?)_(?=$|[\s.,;:!?)'"])/g, '$1<u>$2</u>');

  return s;
}

function orgToHtml(src) {
  const out = [];
  let para = [], list = null, code = null, quote = null, table = null, drawer = false;
  const closePara = () => { if (para.length) { out.push('<p>' + para.map(renderInline).join('<br>') + '</p>'); para = []; } };
  const closeList = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  const closeTable = () => {
    if (!table) return;
    const rows = table.filter(r => !/^\s*\|[-+|\s]*\|\s*$/.test(r)).map(r => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()));
    const head = rows.shift() || [];
    out.push('<table><tr>' + head.map(c => '<th>' + renderInline(c) + '</th>').join('') + '</tr>' + rows.map(r => '<tr>' + r.map(c => '<td>' + renderInline(c) + '</td>').join('') + '</tr>').join('') + '</table>');
    table = null;
  };

  for (const raw of src.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (code !== null) {
      if (/^\s*#\+END_(SRC|EXAMPLE)\s*$/i.test(line)) { out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>'); code = null; } 
      else code.push(raw);
      continue;
    }
    if (/^\s*#\+BEGIN_(SRC|EXAMPLE)/i.test(line)) { closePara(); closeList(); closeTable(); code = []; continue; }
    if (quote !== null) {
      if (/^\s*#\+END_QUOTE\s*$/i.test(line)) { out.push('<blockquote>' + quote.map(renderInline).join('<br>') + '</blockquote>'); quote = null; }
      else quote.push(line);
      continue;
    }
    if (/^\s*#\+BEGIN_QUOTE/i.test(line)) { closePara(); closeList(); closeTable(); quote = []; continue; }
    if (drawer) { if (/^\s*:END:\s*$/i.test(line)) drawer = false; continue; }
    if (/^\s*:[\w-]+:\s*$/.test(line)) { closePara(); closeList(); closeTable(); drawer = true; continue; }
    if (table !== null) { if (/^\s*\|/.test(line)) { table.push(line); continue; } closeTable(); }
    if ((m = line.match(/^\s*\|/))) { closePara(); closeList(); table = [line]; continue; }
    if ((m = line.match(/^(\*+)\s+(.+)$/))) {
      closePara(); closeList(); closeTable();
      const lvl = Math.min(m[1].length, 6);
      out.push('<h' + lvl + '>' + renderInline(m[2].replace(/\s+:[\w@#:]+:\s*$/, '').trim()) + '</h' + lvl + '>');
      continue;
    }
    if ((m = line.match(/^\s*[-+]\s+(.*)$/)) || (m = line.match(/^\s+\*\s+(.*)$/))) {
      closePara(); closeTable();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push('<li>' + renderInline(m[1]) + '</li>'); continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      closePara(); closeTable();
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push('<li>' + renderInline(m[1]) + '</li>'); continue;
    }
    closeList();
    if (/^\s*#\+/i.test(line)) continue;
    if (/^\s*#\s/.test(line)) continue;
    if (!line.trim()) { closePara(); closeTable(); continue; }
    para.push(line.trim());
  }
  closePara(); closeList(); closeTable();
  return out.join('\n');
}

function excerpt(raw, n = 180) {
  const text = raw.split('\n').filter(l => !/^\s*(\*|#|\||:|[-+]\s|\d+[.)]\s)/.test(l)).join(' ').replace(/\s+/g, ' ').trim();
  return text.length > n ? text.slice(0, n).trimEnd() + '…' : text;
}

/* ================= APLIKASI ================= */
let ARTICLES = [];
let currentFilter = '';
let currentLayout = 'all';
const app = document.getElementById('app');

function getLayouts() {
  const layouts = new Set(ARTICLES.map(a => a.layout));
  return ['all', ...Array.from(layouts).filter(l => l !== 'all')];
}

async function load() {
  const loadingEl = document.getElementById('loading');
  try {
    const res = await fetch(TARGET_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rawText = await res.text();
    if (rawText.trim().startsWith('<!DOCTYPE') || rawText.toLowerCase().includes('<html')) {
       showError("URL mengembalikan halaman web, bukan file teks.");
       return;
    }
    const cleanText = rawText.replace(/^\uFEFF/, '');
    ARTICLES = parseOrg(cleanText).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (ARTICLES.length === 0) {
      showError("File berhasil dimuat, tapi tidak ada artikel yang terdeteksi.");
      return;
    }
  } catch (e) {
    showError('Gagal memuat: ' + e.message);
    return;
  }
  if (loadingEl) loadingEl.remove();
  route();
}

function showError(msg) {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.innerHTML = '<div style="background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:1.5rem; border-radius:8px; text-align:left; max-width:600px; margin:2rem auto;"><p style="font-weight:bold; margin-bottom:0.5rem;">❌ Gagal memuat artikel</p><p style="font-size:0.9rem; line-height:1.6;">' + msg + '</p></div>';
  }
}

function renderList() {
  document.title = SITE_TITLE;
  const layouts = getLayouts();
  const layoutLabels = { 'all': '📚 Semua', 'post': '📝 Blog', 'book': '📖 Buku' };
  
  app.innerHTML = '<div class="tabs">' + layouts.map(l => '<button class="tab-btn ' + (currentLayout === l ? 'active' : '') + '" data-layout="' + l + '">' + (layoutLabels[l] || l) + '</button>').join('') + '</div><input id="q" type="search" placeholder="Cari artikel…" value="' + escapeHtml(currentFilter) + '"><div id="list"></div>';
    
  const listEl = document.getElementById('list');
  const draw = () => {
    const q = currentFilter.toLowerCase();
    const items = ARTICLES.filter(a => {
      if (currentLayout !== 'all' && a.layout !== currentLayout) return false;
      if (!q) return true;
      return a.title.toLowerCase().includes(q) || a.raw.toLowerCase().includes(q) || a.tags.some(t => t.toLowerCase().includes(q));
    });
    listEl.innerHTML = items.length ? items.map(a => '<div class="item"><h2><a href="#/artikel/' + encodeURIComponent(a.slug) + '">' + escapeHtml(a.title) + '</a></h2><div class="meta">' + (a.date || 'tanpa tanggal') + ' <span class="layout-badge">' + a.layout + '</span> ' + a.tags.map(t => '<span class="tag">' + escapeHtml(t) + '</span>').join('') + '</div><div class="excerpt">' + escapeHtml(excerpt(a.raw)) + '</div></div>').join('') : '<p>Tidak ada hasil.</p>';
  };

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => { currentLayout = btn.dataset.layout; currentFilter = ''; renderList(); });
  });

  let timeout;
  document.getElementById('q').addEventListener('input', e => {
    clearTimeout(timeout);
    timeout = setTimeout(() => { currentFilter = e.target.value; draw(); }, 200);
  });
  draw();
}

function renderArticle(slug) {
  const a = ARTICLES.find(x => x.slug === slug);
  if (!a) { app.innerHTML = '<p>Artikel tidak ditemukan. <a href="#/">← Kembali</a></p>'; return; }
  document.title = a.title + ' — ' + SITE_TITLE;
  const d = a.date ? new Date(a.date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  app.innerHTML = '<article><div class="meta"><a href="#/">← Kembali</a> · ' + d + ' <span class="layout-badge">' + a.layout + '</span></div><h1>' + escapeHtml(a.title) + '</h1><div style="margin-bottom:1.5rem;">' + a.tags.map(t => '<span class="tag">' + escapeHtml(t) + '</span>').join('') + '</div><div class="content">' + orgToHtml(a.raw) + '</div><hr><a href="#/">← Kembali ke daftar artikel</a></article>';
  window.scrollTo(0, 0);
}

function route() {
  const m = (location.hash || '#/').match(/^#\/artikel\/(.+)$/);
  if (m) renderArticle(decodeURIComponent(m[1]));
  else renderList();
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', load);
