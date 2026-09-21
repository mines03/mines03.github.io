/* ================= KONFIG ================= */

// URL proxy Anda.
const TARGET_URL = 'https://artikel-proxy.extra03-mine.workers.dev/';
const SITE_TITLE = 'Blog Saya';


/* ================= UTIL ================= */

function escapeHtml(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function parseDate(value) {
  if (!value) return null;

  const match = String(value).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function escapeAttribute(value) {
  return escapeHtml(String(value ?? ''));
}

function isImageUrl(value) {
  const url = String(value || '').trim();

  try {
    const parsed = new URL(url, window.location.href);

    return /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|tif|tiff)$/i.test(
      parsed.pathname
    );
  } catch {
    return /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|tif|tiff)(?:[?#].*)?$/i.test(
      url
    );
  }
}

function isSafeUrl(value) {
  const url = String(value || '').trim();

  return !/^(javascript|vbscript|data):/i.test(url);
}


/* ================= PARSER ORG ================= */

function parseOrg(text) {
  const articles = [];

  let currentArticle = null;
  let buffer = [];
  let insideDrawer = false;

  function flushArticle() {
    if (!currentArticle) return;

    currentArticle.raw = buffer.join('\n').trim();

    const dateFromBody = (
      currentArticle.raw.match(/^\s*[<\[](\d{4}-\d{2}-\d{2})/) || []
    )[1];

    currentArticle.date =
      parseDate(
        currentArticle.props.date ||
        currentArticle.props.tanggal
      ) ||
      parseDate(dateFromBody);

    currentArticle.slug =
      currentArticle.props.slug ||
      currentArticle.props.id ||
      slugify(currentArticle.title);

    currentArticle.layout =
      currentArticle.props.layout ||
      'post';

    articles.push(currentArticle);

    currentArticle = null;
    buffer = [];
  }

  for (const line of String(text || '').split(/\r?\n/)) {
    const headingMatch = line.match(/^(\*+)\s+(.*)$/);

    // Hanya heading level 1 yang dianggap artikel.
    if (headingMatch && headingMatch[1].length === 1) {
      flushArticle();

      let title = headingMatch[2].trim();
      let tags = [];

      const tagMatch = title.match(
        /^(.*?)\s+(:[\w@#:%-]+:)\s*$/
      );

      if (tagMatch) {
        title = tagMatch[1].trim();
        tags = tagMatch[2]
          .split(':')
          .filter(Boolean);
      }

      currentArticle = {
        title,
        tags,
        props: {}
      };

      continue;
    }

    if (!currentArticle) continue;

    if (/^\s*:PROPERTIES:\s*$/i.test(line)) {
      insideDrawer = true;
      continue;
    }

    if (
      insideDrawer &&
      /^\s*:END:\s*$/i.test(line)
    ) {
      insideDrawer = false;
      continue;
    }

    if (insideDrawer) {
      const propertyMatch = line.match(
        /^\s*:([\w-]+):\s*(.*)$/
      );

      if (propertyMatch) {
        currentArticle.props[
          propertyMatch[1].toLowerCase()
        ] = propertyMatch[2].trim();
      }

      continue;
    }

    buffer.push(line);
  }

  flushArticle();

  return articles;
}


/* ================= ORG INLINE -> HTML ================= */

function renderInline(input) {
  let source = String(input ?? '');
  const protectedHtml = [];

  function protect(html) {
    const token = `\u0000HTML_${protectedHtml.length}\u0000`;
    protectedHtml.push(html);
    return token;
  }

  function safeUrl(value) {
    const url = String(value || '').trim();

    if (!isSafeUrl(url)) {
      return '#';
    }

    return escapeAttribute(url);
  }

  function safeText(value) {
    return escapeHtml(String(value ?? ''));
  }

  /*
   * YouTube
   *
   * [[youtube:VIDEO_ID][Teks]]
   */
  source = source.replace(
    /\[\[youtube:([^\]\s]+)\]\[([^\]]*)\]\]/gi,
    function (_, videoId, text) {
      const safeVideoId = safeUrl(videoId);
      const safeTitle = safeText(text || 'YouTube video');

      return protect(`
        <div class="youtube-embed">
          <iframe
            src="https://www.youtube.com/embed/${safeVideoId}"
            title="${safeTitle}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy">
          </iframe>
        </div>
      `);
    }
  );

  /*
   * Audio
   *
   * [[audio:URL][Teks]]
   */
  source = source.replace(
    /\[\[audio:([^\]]+)\]\[([^\]]*)\]\]/gi,
    function (_, url, text) {
      const safeAudioUrl = safeUrl(url);
      const safeAudioText = safeText(text || 'Unduh audio');

      return protect(`
        <div class="audio-player">
          <audio controls style="width:100%;">
            <source src="${safeAudioUrl}" type="audio/mpeg">
            Browser tidak mendukung audio.
            <a
              href="${safeAudioUrl}"
              target="_blank"
              rel="noopener">
              ${safeAudioText}
            </a>
          </audio>
        </div>
      `);
    }
  );

  /*
   * Link atau gambar dengan deskripsi
   *
   * [[URL][Teks]]
   */
  source = source.replace(
    /\[\[([^\]]+)\]\[([^\]]*)\]\]/g,
    function (_, rawUrl, rawText) {
      const url = String(rawUrl).trim();
      const text = String(rawText).trim();

      if (isImageUrl(url)) {
        return protect(`
          <img
            src="${safeUrl(url)}"
            alt="${safeText(text || 'image')}"
            loading="lazy"
            style="display:block;max-width:100%;height:auto;border-radius:4px;margin:10px 0;">
        `);
      }

      return protect(`
        <a
          href="${safeUrl(url)}"
          target="_blank"
          rel="noopener">
          ${safeText(text || url)}
        </a>
      `);
    }
  );

  /*
   * Link atau gambar tanpa deskripsi
   *
   * [[URL]]
   */
  source = source.replace(
    /\[\[([^\]]+)\]\]/g,
    function (_, rawUrl) {
      const url = String(rawUrl).trim();

      if (isImageUrl(url)) {
        return protect(`
          <img
            src="${safeUrl(url)}"
            alt="image"
            loading="lazy"
            style="display:block;max-width:100%;height:auto;border-radius:4px;margin:10px 0;">
        `);
      }

      return protect(`
        <a
          href="${safeUrl(url)}"
          target="_blank"
          rel="noopener">
          ${safeText(url)}
        </a>
      `);
    }
  );

  /*
   * Escape seluruh teks biasa.
   *
   * HTML hasil renderer sudah diganti token sehingga
   * tidak ikut ter-escape.
   */
  source = escapeHtml(source);

  /*
   * Inline code Org-mode
   */
  source = source.replace(
    /~([^~\n]+)~/g,
    '<code>$1</code>'
  );

  source = source.replace(
    /=([^=\n]+)=/g,
    '<code>$1</code>'
  );

  /*
   * Bold
   */
  source = source.replace(
    /(^|[\s('">])\*([^*\n]+?)\*(?=$|[\s.,;:!?)'"])/g,
    '$1<strong>$2</strong>'
  );

  /*
   * Italic
   */
  source = source.replace(
    /(^|[\s('">])\/([^\/\n]+?)\/(?=$|[\s.,;:!?)'"])/g,
    '$1<em>$2</em>'
  );

  /*
   * Underline
   */
  source = source.replace(
    /(^|[\s('">])_([^_\n]+?)_(?=$|[\s.,;:!?)'"])/g,
    '$1<u>$2</u>'
  );

  /*
   * Kembalikan HTML yang sudah dilindungi.
   */
  source = source.replace(
    /\u0000HTML_(\d+)\u0000/g,
    function (_, index) {
      return protectedHtml[Number(index)] || '';
    }
  );

  return source;
}


/* ================= ORG -> HTML ================= */

function orgToHtml(source) {
  const output = [];

  let paragraph = [];
  let listType = null;
  let codeBlock = null;
  let quoteBlock = null;
  let tableRows = null;
  let insideDrawer = false;

  function closeParagraph() {
    if (!paragraph.length) return;

    output.push(
      '<p>' +
      paragraph
        .map(renderInline)
        .join('<br>') +
      '</p>'
    );

    paragraph = [];
  }

  function closeList() {
    if (!listType) return;

    output.push(`</${listType}>`);
    listType = null;
  }

  function closeTable() {
    if (!tableRows) return;

    const filteredRows = tableRows
      .filter(row => {
        return !/^\s*\|[-+|\s]*\|\s*$/.test(row);
      })
      .map(row => {
        return row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map(cell => cell.trim());
      });

    const header = filteredRows.shift() || [];

    output.push(
      '<table>' +
      '<thead>' +
      '<tr>' +
      header
        .map(cell => `<th>${renderInline(cell)}</th>`)
        .join('') +
      '</tr>' +
      '</thead>' +
      '<tbody>' +
      filteredRows
        .map(row => {
          return (
            '<tr>' +
            row
              .map(cell => `<td>${renderInline(cell)}</td>`)
              .join('') +
            '</tr>'
          );
        })
        .join('') +
      '</tbody>' +
      '</table>'
    );

    tableRows = null;
  }

  for (const rawLine of String(source || '').split('\n')) {
    const line = rawLine.replace(/\s+$/, '');

    let match;

    /*
     * Source atau example block
     */
    if (codeBlock !== null) {
      if (
        /^\s*#\+END_(SRC|EXAMPLE)\s*$/i.test(line)
      ) {
        output.push(
          '<pre><code>' +
          escapeHtml(codeBlock.join('\n')) +
          '</code></pre>'
        );

        codeBlock = null;
      } else {
        codeBlock.push(rawLine);
      }

      continue;
    }

    if (
      /^\s*#\+BEGIN_(SRC|EXAMPLE)/i.test(line)
    ) {
      closeParagraph();
      closeList();
      closeTable();

      codeBlock = [];
      continue;
    }

    /*
     * Quote block
     */
    if (quoteBlock !== null) {
      if (
        /^\s*#\+END_QUOTE\s*$/i.test(line)
      ) {
        output.push(
          '<blockquote>' +
          quoteBlock
            .map(renderInline)
            .join('<br>') +
          '</blockquote>'
        );

        quoteBlock = null;
      } else {
        quoteBlock.push(line);
      }

      continue;
    }

    if (
      /^\s*#\+BEGIN_QUOTE/i.test(line)
    ) {
      closeParagraph();
      closeList();
      closeTable();

      quoteBlock = [];
      continue;
    }

    /*
     * Drawer biasa
     */
    if (insideDrawer) {
      if (/^\s*:END:\s*$/i.test(line)) {
        insideDrawer = false;
      }

      continue;
    }

    if (
      /^\s*:[\w-]+:\s*$/.test(line)
    ) {
      closeParagraph();
      closeList();
      closeTable();

      insideDrawer = true;
      continue;
    }

    /*
     * Tabel Org-mode
     */
    if (tableRows !== null) {
      if (/^\s*\|/.test(line)) {
        tableRows.push(line);
        continue;
      }

      closeTable();
    }

    if (/^\s*\|/.test(line)) {
      closeParagraph();
      closeList();

      tableRows = [line];
      continue;
    }

    /*
     * Heading
     */
    match = line.match(/^(\*+)\s+(.+)$/);

    if (match) {
      closeParagraph();
      closeList();
      closeTable();

      const level = Math.min(match[1].length, 6);

      const heading = match[2]
        .replace(/\s+:[\w@#:%-]+:\s*$/, '')
        .trim();

      output.push(
        `<h${level}>${renderInline(heading)}</h${level}>`
      );

      continue;
    }

    /*
     * Unordered list
     */
    match =
      line.match(/^\s*[-+]\s+(.*)$/) ||
      line.match(/^\s+\*\s+(.*)$/);

    if (match) {
      closeParagraph();
      closeTable();

      if (listType !== 'ul') {
        closeList();
        output.push('<ul>');
        listType = 'ul';
      }

      output.push(
        `<li>${renderInline(match[1])}</li>`
      );

      continue;
    }

    /*
     * Ordered list
     */
    match = line.match(
      /^\s*\d+[.)]\s+(.*)$/
    );

    if (match) {
      closeParagraph();
      closeTable();

      if (listType !== 'ol') {
        closeList();
        output.push('<ol>');
        listType = 'ol';
      }

      output.push(
        `<li>${renderInline(match[1])}</li>`
      );

      continue;
    }

    closeList();

    /*
     * Directive Org-mode
     */
    if (/^\s*#\+/i.test(line)) {
      continue;
    }

    /*
     * Komentar Org-mode
     */
    if (/^\s*#\s/.test(line)) {
      continue;
    }

    /*
     * Baris kosong
     */
    if (!line.trim()) {
      closeParagraph();
      closeTable();
      continue;
    }

    /*
     * Link gambar yang berdiri sendiri.
     *
     * Ini membuat gambar tidak dibungkus <p>.
     */
    const standaloneImage = line
      .trim()
      .match(
        /^\[\[([^\]]+\.(?:jpg|jpeg|png|gif|webp|svg|avif|bmp|tif|tiff)(?:[?#][^\]]*)?)\]\]$/i
      );

    if (standaloneImage) {
      closeParagraph();
      closeTable();

      output.push(
        renderInline(line.trim())
      );

      continue;
    }

    paragraph.push(line.trim());
  }

  closeParagraph();
  closeList();
  closeTable();

  return output.join('\n');
}


/* ================= EXCERPT ================= */

function excerpt(raw, length = 180) {
  const text = String(raw || '')
    .split('\n')
    .filter(line => {
      return !/^\s*(\*|#|\||:|[-+]\s|\d+[.)]\s)/.test(line);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > length
    ? text.slice(0, length).trimEnd() + '…'
    : text;
}


/* ================= APLIKASI ================= */

let ARTICLES = [];
let currentFilter = '';
let currentLayout = 'all';

const app = document.getElementById('app');


function getLayouts() {
  const layouts = new Set(
    ARTICLES.map(article => article.layout)
  );

  return [
    'all',
    ...Array.from(layouts).filter(
      layout => layout !== 'all'
    )
  ];
}


async function load() {
  const loadingElement =
    document.getElementById('loading');

  try {
    console.log(
      'Mengambil data dari:',
      TARGET_URL
    );

    const response = await fetch(TARGET_URL, {
      method: 'GET',
      cache: 'no-cache'
    });

    if (!response.ok) {
      throw new Error(
        `HTTP Error: ${response.status} ${response.statusText}`
      );
    }

    const rawText = await response.text();

    const lowerText = rawText
      .trim()
      .slice(0, 500)
      .toLowerCase();

    if (
      lowerText.startsWith('<!doctype') ||
      lowerText.includes('<html')
    ) {
      showError(
        'URL mengembalikan halaman web, bukan file teks. ' +
        'Pastikan proxy Anda mengembalikan file .org mentah.'
      );

      return;
    }

    const cleanText = rawText.replace(/^\uFEFF/, '');

    ARTICLES = parseOrg(cleanText)
      .sort((first, second) => {
        return (second.date || '')
          .localeCompare(first.date || '');
      });

    if (!ARTICLES.length) {
      showError(
        'File berhasil dimuat, tetapi tidak ada artikel yang ' +
        'terdeteksi. Pastikan format file .org benar dan artikel ' +
        'dimulai dengan <code>* Judul</code>.'
      );

      return;
    }
  } catch (error) {
    console.error(error);

    showError(
      'Gagal memuat: ' +
      escapeHtml(error.message) +
      '<br><br>' +
      'Pastikan URL proxy aktif dan mengembalikan file teks.'
    );

    return;
  }

  if (loadingElement) {
    loadingElement.remove();
  }

  route();
}


function showError(message) {
  const loadingElement =
    document.getElementById('loading');

  if (!loadingElement) return;

  loadingElement.innerHTML = `
    <div style="
      background:#fef2f2;
      border:1px solid #fecaca;
      color:#991b1b;
      padding:1.5rem;
      border-radius:8px;
      text-align:left;
      max-width:600px;
      margin:2rem auto;
    ">
      <p style="
        font-weight:bold;
        margin-bottom:0.5rem;
      ">
        ❌ Gagal memuat artikel
      </p>

      <p style="
        font-size:0.9rem;
        line-height:1.6;
      ">
        ${message}
      </p>
    </div>
  `;
}


function renderList() {
  document.title = SITE_TITLE;

  const layouts = getLayouts();

  const layoutLabels = {
    all: '📚 Semua',
    post: '📝 Blog',
    book: '📖 Buku'
  };

  app.innerHTML = `
    <div class="tabs">
      ${layouts.map(layout => `
        <button
          class="tab-btn ${currentLayout === layout ? 'active' : ''}"
          data-layout="${escapeAttribute(layout)}">
          ${escapeHtml(layoutLabels[layout] || layout)}
        </button>
      `).join('')}
    </div>

    <input
      id="q"
      type="search"
      placeholder="Cari artikel…"
      value="${escapeAttribute(currentFilter)}">

    <div id="list"></div>
  `;

  const listElement =
    document.getElementById('list');

  function drawList() {
    const query = currentFilter
      .toLowerCase()
      .trim();

    const filteredArticles = ARTICLES.filter(article => {
      if (
        currentLayout !== 'all' &&
        article.layout !== currentLayout
      ) {
        return false;
      }

      if (!query) return true;

      return (
        article.title.toLowerCase().includes(query) ||
        article.raw.toLowerCase().includes(query) ||
        article.tags.some(tag =>
          tag.toLowerCase().includes(query)
        )
      );
    });

    if (!filteredArticles.length) {
      listElement.innerHTML =
        '<p>Tidak ada hasil.</p>';

      return;
    }

    listElement.innerHTML = filteredArticles
      .map(article => {
        const articleSlug =
          encodeURIComponent(article.slug);

        const tags = article.tags
          .map(tag => `
            <span class="tag">
              ${escapeHtml(tag)}
            </span>
          `)
          .join('');

        return `
          <div class="item">
            <h2>
              <a href="#/artikel/${articleSlug}">
                ${escapeHtml(article.title)}
              </a>
            </h2>

            <div class="meta">
              ${escapeHtml(article.date || 'tanpa tanggal')}

              <span class="layout-badge">
                ${escapeHtml(article.layout)}
              </span>

              ${tags}
            </div>

            <div class="excerpt">
              ${escapeHtml(excerpt(article.raw))}
            </div>
          </div>
        `;
      })
      .join('');
  }

  document
    .querySelectorAll('.tab-btn')
    .forEach(button => {
      button.addEventListener('click', () => {
        currentLayout = button.dataset.layout;
        currentFilter = '';

        renderList();
      });
    });

  let searchTimeout;

  const searchElement =
    document.getElementById('q');

  searchElement.addEventListener('input', event => {
    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
      currentFilter = event.target.value;
      drawList();
    }, 200);
  });

  drawList();
}


function renderArticle(slug) {
  const article = ARTICLES.find(
    item => item.slug === slug
  );

  if (!article) {
    app.innerHTML = `
      <p>
        Artikel tidak ditemukan.
        <a href="#/">← Kembali</a>
      </p>
    `;

    return;
  }

  document.title =
    `${article.title} — ${SITE_TITLE}`;

  const formattedDate = article.date
    ? new Date(
        `${article.date}T00:00:00`
      ).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : '';

  const tags = article.tags
    .map(tag => `
      <span class="tag">
        ${escapeHtml(tag)}
      </span>
    `)
    .join('');

  app.innerHTML = `
    <article>
      <div class="meta">
        <a href="#/">← Kembali</a>
        · ${escapeHtml(formattedDate)}

        <span class="layout-badge">
          ${escapeHtml(article.layout)}
        </span>
      </div>

      <h1>
        ${escapeHtml(article.title)}
      </h1>

      <div style="margin-bottom:1.5rem;">
        ${tags}
      </div>

      <div class="content">
        ${orgToHtml(article.raw)}
      </div>

      <hr>

      <a href="#/">
        ← Kembali ke daftar artikel
      </a>
    </article>
  `;

  window.scrollTo(0, 0);
}


/* ================= ROUTER ================= */

function route() {
  const match = (
    location.hash || '#/'
  ).match(/^#\/artikel\/(.+)$/);

  if (match) {
    renderArticle(
      decodeURIComponent(match[1])
    );
  } else {
    renderList();
  }
}


/* ================= EVENT ================= */

window.addEventListener(
  'hashchange',
  route
);

window.addEventListener(
  'DOMContentLoaded',
  load
);
