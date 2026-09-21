/* ================= KONFIG ================= */

const TARGET_URL = 'https://artikel-proxy.extra03-mine.workers.dev/';

const SITE_TITLE = 'Blog Saya';


/* ================= STATE ================= */

let ARTICLES = [];
let currentLayout = 'post';
let currentFilter = '';
let currentTag = '';

const app = document.getElementById('app');


/* ================= UTILITAS ================= */

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(String(value ?? ''));
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
  if (!value) {
    return null;
  }

  const match = String(value).match(
    /(\d{4}-\d{2}-\d{2})/
  );

  return match ? match[1] : null;
}

function normalizeTag(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeLayout(value) {
  const layout = String(value || '')
    .trim()
    .toLowerCase();

  /*
   * Aplikasi hanya menerima dua layout:
   * post dan book.
   */
  if (layout === 'post') {
    return 'post';
  }

  if (layout === 'book') {
    return 'book';
  }

  /*
   * Nilai layout lain dianggap post
   * agar artikel tetap dapat tampil.
   */
  return 'post';
}

function isSafeUrl(value) {
  const url = String(value || '').trim();

  return !/^(javascript|vbscript|data):/i.test(url);
}

function isImageUrl(value) {
  const url = String(value || '').trim();

  try {
    const parsedUrl = new URL(
      url,
      window.location.href
    );

    return /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|tif|tiff)$/i.test(
      parsedUrl.pathname
    );
  } catch {
    return /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|tif|tiff)(?:[?#].*)?$/i.test(
      url
    );
  }
}

function getPlaceholderCover(
  text = 'Tidak ada cover'
) {
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="600"
        height="850"
        viewBox="0 0 600 850">

        <rect
          width="600"
          height="850"
          fill="#e5e7eb"/>

        <text
          x="300"
          y="400"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          font-size="32"
          fill="#6b7280">
          ${text}
        </text>
      </svg>
    `)
  );
}


/* ================= COVER BUKU ================= */

function findFirstImageUrl(raw) {
  const text = String(raw || '');

  /*
   * Format:
   * [[URL][Deskripsi]]
   */
  const imageWithDescription = text.match(
    /\[\[([^\]\s]+?\.(?:jpg|jpeg|png|gif|webp|svg|avif|bmp|tif|tiff)(?:[?#].*)?)\]\[[^\]]*\]\]/i
  );

  if (imageWithDescription) {
    return imageWithDescription[1].trim();
  }

  /*
   * Format:
   * [[URL]]
   */
  const imageWithoutDescription = text.match(
    /\[\[([^\]\s]+?\.(?:jpg|jpeg|png|gif|webp|svg|avif|bmp|tif|tiff)(?:[?#].*)?)\]\]/i
  );

  if (imageWithoutDescription) {
    return imageWithoutDescription[1].trim();
  }

  return '';
}


/* ================= TAG ================= */

function tagButton(tag) {
  const cleanTag = String(tag || '').trim();

  if (!cleanTag) {
    return '';
  }

  return `
    <button
      type="button"
      class="tag tag-button"
      data-tag="${escapeAttribute(cleanTag)}"
      title="Tampilkan artikel dengan tag ${escapeAttribute(cleanTag)}">
      ${escapeHtml(cleanTag)}
    </button>
  `;
}


/* ================= PARSER ORG ================= */

function parseOrg(text) {
  const articles = [];

  let currentArticle = null;
  let buffer = [];
  let insideDrawer = false;

  function flushArticle() {
    if (!currentArticle) {
      return;
    }

    currentArticle.raw = buffer.join('\n').trim();

    const dateFromBody = (
      currentArticle.raw.match(
        /^\s*[<\[](\d{4}-\d{2}-\d{2})/
      ) || []
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

    /*
     * Hanya post atau book.
     */
    currentArticle.layout = normalizeLayout(
      currentArticle.props.layout || 'post'
    );

    currentArticle.author =
      currentArticle.props.author ||
      currentArticle.props.penulis ||
      '';

    currentArticle.cover =
      currentArticle.props.cover ||
      currentArticle.props.image ||
      currentArticle.props.gambar ||
      findFirstImageUrl(currentArticle.raw);

    currentArticle.tags = currentArticle.tags
      .map(tag => String(tag).trim())
      .filter(Boolean);

    articles.push(currentArticle);

    currentArticle = null;
    buffer = [];
  }

  for (
    const line of String(text || '').split(/\r?\n/)
  ) {
    const headingMatch = line.match(
      /^(\*+)\s+(.*)$/
    );

    /*
     * Heading level satu adalah artikel.
     */
    if (
      headingMatch &&
      headingMatch[1].length === 1
    ) {
      flushArticle();

      let title = headingMatch[2].trim();
      let tags = [];

      /*
       * Contoh:
       * * Harry Potter :fantasy:books:
       */
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

    if (!currentArticle) {
      continue;
    }

    /*
     * Awal property drawer.
     */
    if (
      /^\s*:PROPERTIES:\s*$/i.test(line)
    ) {
      insideDrawer = true;
      continue;
    }

    /*
     * Akhir property drawer.
     */
    if (
      insideDrawer &&
      /^\s*:END:\s*$/i.test(line)
    ) {
      insideDrawer = false;
      continue;
    }

    /*
     * Baca property drawer.
     */
    if (insideDrawer) {
      const propertyMatch = line.match(
        /^\s*:([\w-]+):\s*(.*)$/
      );

      if (propertyMatch) {
        const propertyName =
          propertyMatch[1].toLowerCase();

        currentArticle.props[propertyName] =
          propertyMatch[2].trim();
      }

      continue;
    }

    buffer.push(line);
  }

  flushArticle();

  return articles;
}


/* ================= INLINE ORG KE HTML ================= */

function renderInline(input) {
  let source = String(input ?? '');
  const protectedHtml = [];

  function protect(html) {
    const token =
      `\u0000HTML_${protectedHtml.length}\u0000`;

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
   * YouTube:
   * [[youtube:ID][Teks]]
   */
  source = source.replace(
    /\[\[youtube:([^\]\s]+)\]\[([^\]]*)\]\]/gi,
    function (_, videoId, text) {
      const safeVideoId = safeUrl(videoId);
      const safeTitle = safeText(
        text || 'YouTube video'
      );

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
   * Audio:
   * [[audio:URL][Teks]]
   */
  source = source.replace(
    /\[\[audio:([^\]]+)\]\[([^\]]*)\]\]/gi,
    function (_, url, text) {
      const safeAudioUrl = safeUrl(url);
      const safeAudioText = safeText(
        text || 'Unduh audio'
      );

      return protect(`
        <div class="audio-player">
          <audio controls style="width:100%;">
            <source
              src="${safeAudioUrl}"
              type="audio/mpeg">

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
   * Link/gambar dengan deskripsi:
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
            style="
              display:block;
              max-width:100%;
              height:auto;
              border-radius:4px;
              margin:10px 0;
            ">
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
   * Link/gambar tanpa deskripsi:
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
            style="
              display:block;
              max-width:100%;
              height:auto;
              border-radius:4px;
              margin:10px 0;
            ">
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
   * Escape semua teks biasa.
   */
  source = escapeHtml(source);

  /*
   * Inline code.
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
   * Bold.
   */
  source = source.replace(
    /(^|[\s('">])\*([^*\n]+?)\*(?=$|[\s.,;:!?)'"])/g,
    '$1<strong>$2</strong>'
  );

  /*
   * Italic.
   */
  source = source.replace(
    /(^|[\s('">])\/([^\/\n]+?)\/(?=$|[\s.,;:!?)'"])/g,
    '$1<em>$2</em>'
  );

  /*
   * Underline.
   */
  source = source.replace(
    /(^|[\s('">])_([^_\n]+?)_(?=$|[\s.,;:!?)'"])/g,
    '$1<u>$2</u>'
  );

  /*
   * Kembalikan HTML yang dilindungi.
   */
  source = source.replace(
    /\u0000HTML_(\d+)\u0000/g,
    function (_, index) {
      return protectedHtml[Number(index)] || '';
    }
  );

  return source;
}


/* ================= ORG KE HTML ================= */

function orgToHtml(source) {
  const output = [];

  let paragraph = [];
  let listType = null;
  let codeBlock = null;
  let quoteBlock = null;
  let tableRows = null;
  let insideDrawer = false;

  function closeParagraph() {
    if (!paragraph.length) {
      return;
    }

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
    if (!listType) {
      return;
    }

    output.push(`</${listType}>`);
    listType = null;
  }

  function closeTable() {
    if (!tableRows) {
      return;
    }

    const rows = tableRows
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

    const header = rows.shift() || [];

    output.push(`
      <table>
        <thead>
          <tr>
            ${header
              .map(cell => {
                return `<th>${renderInline(cell)}</th>`;
              })
              .join('')}
          </tr>
        </thead>

        <tbody>
          ${rows
            .map(row => `
              <tr>
                ${row
                  .map(cell => {
                    return `<td>${renderInline(cell)}</td>`;
                  })
                  .join('')}
              </tr>
            `)
            .join('')}
        </tbody>
      </table>
    `);

    tableRows = null;
  }

  for (
    const rawLine of String(source || '').split('\n')
  ) {
    const line = rawLine.replace(/\s+$/, '');

    let match;

    /*
     * Source/example block.
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
     * Quote block.
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
     * Drawer.
     */
    if (insideDrawer) {
      if (
        /^\s*:END:\s*$/i.test(line)
      ) {
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
     * Tabel.
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
     * Heading.
     */
    match = line.match(/^(\*+)\s+(.+)$/);

    if (match) {
      closeParagraph();
      closeList();
      closeTable();

      const level = Math.min(
        match[1].length,
        6
      );

      const heading = match[2]
        .replace(/\s+:[\w@#:%-]+:\s*$/, '')
        .trim();

      output.push(
        `<h${level}>${renderInline(heading)}</h${level}>`
      );

      continue;
    }

    /*
     * Unordered list.
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
     * Ordered list.
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
     * Directive.
     */
    if (/^\s*#\+/i.test(line)) {
      continue;
    }

    /*
     * Komentar.
     */
    if (/^\s*#\s/.test(line)) {
      continue;
    }

    /*
     * Baris kosong.
     */
    if (!line.trim()) {
      closeParagraph();
      closeTable();
      continue;
    }

    /*
     * Gambar standalone.
     */
    const standaloneImage = line
      .trim()
      .match(
        /^\[\[([^\]]+\.(?:jpg|jpeg|png|gif|webp|svg|avif|bmp|tif|tiff)(?:[?#][^\]]*)?)\]\](?:\s*)$/i
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


/* ================= FILTER TAG ================= */

function setTagFilter(tag) {
  currentTag = String(tag || '').trim();
  currentFilter = '';

  renderList();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function clearTagFilter() {
  currentTag = '';
  renderList();
}


/* ================= LOAD ================= */

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

    const beginning = rawText
      .trim()
      .slice(0, 500)
      .toLowerCase();

    if (
      beginning.startsWith('<!doctype') ||
      beginning.includes('<html')
    ) {
      showError(
        'URL mengembalikan halaman web, bukan file teks. ' +
        'Pastikan proxy mengembalikan file .org mentah.'
      );

      return;
    }

    const cleanText = rawText.replace(
      /^\uFEFF/,
      ''
    );

    ARTICLES = parseOrg(cleanText)
      .sort((first, second) => {
        return (second.date || '')
          .localeCompare(first.date || '');
      });

    if (!ARTICLES.length) {
      showError(
        'File berhasil dimuat, tetapi tidak ada artikel ' +
        'yang terdeteksi. Pastikan artikel dimulai dengan ' +
        '<code>* Judul</code>.'
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


/* ================= ERROR ================= */

function showError(message) {
  const loadingElement =
    document.getElementById('loading');

  if (!loadingElement) {
    return;
  }

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


/* ================= BOOK CARD ================= */

function renderBookCard(article) {
  const articleSlug =
    encodeURIComponent(article.slug);

  const placeholder =
    getPlaceholderCover('Tidak ada cover');

  const coverUrl =
    article.cover || placeholder;

  const tags = article.tags
    .map(tag => tagButton(tag))
    .join('');

  return `
    <article class="book-card">
      <a
        class="book-card-link"
        href="#/artikel/${articleSlug}"
        aria-label="Buka buku ${escapeAttribute(article.title)}">

        <div class="book-cover-wrapper">
          <img
            class="book-cover"
            src="${escapeAttribute(coverUrl)}"
            alt="Cover ${escapeAttribute(article.title)}"
            loading="lazy"
            onerror="this.onerror=null;this.src='${placeholder}';">

          <div class="book-overlay">
            Buka buku
          </div>
        </div>

        <div class="book-info">
          <h2 class="book-title">
            ${escapeHtml(article.title)}
          </h2>

          ${
            article.author
              ? `
                <div class="book-author">
                  ${escapeHtml(article.author)}
                </div>
              `
              : ''
          }

          <div class="book-meta">
            ${escapeHtml(
              article.date || 'tanpa tanggal'
            )}
          </div>
        </div>
      </a>

      <div class="book-tags">
        ${tags}
      </div>
    </article>
  `;
}


/* ================= RENDER LIST ================= */

function renderList() {
  document.title = SITE_TITLE;

  /*
   * Hanya dua tab.
   */
  const layouts = [
    'post',
    'book'
  ];

  const layoutLabels = {
    post: '📝 Blog',
    book: '📖 Buku'
  };

  const activeTagInfo = currentTag
    ? `
      <div class="active-filter">
        <span>Menampilkan tag:</span>

        <button
          type="button"
          class="active-tag"
          data-action="clear-tag">
          ${escapeHtml(currentTag)}
        </button>

        <button
          type="button"
          class="clear-filter"
          data-action="clear-tag"
          title="Hapus filter tag">
          ×
        </button>
      </div>
    `
    : '';

  app.innerHTML = `
    <div class="tabs">
      ${layouts
        .map(layout => `
          <button
            type="button"
            class="tab-btn ${
              currentLayout === layout
                ? 'active'
                : ''
            }"
            data-layout="${layout}">
            ${layoutLabels[layout]}
          </button>
        `)
        .join('')}
    </div>

    ${activeTagInfo}

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

    const selectedTag =
      normalizeTag(currentTag);

    const filteredArticles = ARTICLES.filter(
      article => {
        /*
         * Layout hanya post atau book.
         */
        if (
          article.layout !== currentLayout
        ) {
          return false;
        }

        /*
         * Filter tag.
         */
        if (
          selectedTag &&
          !article.tags.some(tag => {
            return normalizeTag(tag) === selectedTag;
          })
        ) {
          return false;
        }

        /*
         * Filter pencarian.
         */
        if (!query) {
          return true;
        }

        return (
          article.title
            .toLowerCase()
            .includes(query) ||
          article.raw
            .toLowerCase()
            .includes(query) ||
          article.tags.some(tag => {
            return tag.toLowerCase().includes(query);
          })
        );
      }
    );

    if (!filteredArticles.length) {
      listElement.innerHTML = `
        <p>Tidak ada artikel yang cocok.</p>
      `;

      return;
    }

    /*
     * Tab Buku menampilkan grid cover.
     */
    if (currentLayout === 'book') {
      listElement.innerHTML = `
        <div class="books-grid">
          ${filteredArticles
            .map(article => {
              return renderBookCard(article);
            })
            .join('')}
        </div>
      `;

      return;
    }

    /*
     * Tab Blog menampilkan daftar artikel.
     */
    listElement.innerHTML = filteredArticles
      .map(article => {
        const articleSlug =
          encodeURIComponent(article.slug);

        const articleTags = article.tags
          .map(tag => tagButton(tag))
          .join('');

        return `
          <div class="item">
            <h2>
              <a href="#/artikel/${articleSlug}">
                ${escapeHtml(article.title)}
              </a>
            </h2>

            <div class="meta">
              ${escapeHtml(
                article.date || 'tanpa tanggal'
              )}

              <span class="layout-badge">
                Blog
              </span>

              ${articleTags}
            </div>

            <div class="excerpt">
              ${escapeHtml(
                excerpt(article.raw)
              )}
            </div>
          </div>
        `;
      })
      .join('');
  }

  /*
   * Tombol tab Blog dan Buku.
   */
  document
    .querySelectorAll('.tab-btn')
    .forEach(button => {
      button.addEventListener('click', () => {
        currentLayout =
          button.dataset.layout;

        currentFilter = '';

        renderList();
      });
    });

  /*
   * Klik tag pada daftar.
   */
  listElement.addEventListener(
    'click',
    event => {
      const tagElement =
        event.target.closest('.tag-button');

      if (!tagElement) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      setTagFilter(
        tagElement.dataset.tag || ''
      );
    }
  );

  /*
   * Hapus filter tag.
   */
  document
    .querySelectorAll('[data-action="clear-tag"]')
    .forEach(button => {
      button.addEventListener('click', () => {
        clearTagFilter();
      });
    });

  /*
   * Pencarian artikel.
   */
  let searchTimeout;

  const searchElement =
    document.getElementById('q');

  searchElement.addEventListener(
    'input',
    event => {
      clearTimeout(searchTimeout);

      searchTimeout = setTimeout(() => {
        currentFilter = event.target.value;
        drawList();
      }, 200);
    }
  );

  drawList();
}


/* ================= DETAIL ARTIKEL ================= */

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

  const articleTags = article.tags
    .map(tag => tagButton(tag))
    .join('');

  app.innerHTML = `
    <article>
      <div class="meta">
        <a href="#/">← Kembali</a>
        · ${escapeHtml(formattedDate)}

        <span class="layout-badge">
          ${
            article.layout === 'book'
              ? 'Buku'
              : 'Blog'
          }
        </span>
      </div>

      <h1>
        ${escapeHtml(article.title)}
      </h1>

      ${
        article.author
          ? `
            <div class="article-author">
              Penulis:
              ${escapeHtml(article.author)}
            </div>
          `
          : ''
      }

      <div class="article-tags">
        ${articleTags}
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

  /*
   * Tag pada halaman detail.
   */
  document
    .querySelectorAll('.tag-button')
    .forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();

        currentLayout =
          article.layout;

        setTagFilter(
          button.dataset.tag || ''
        );
      });
    });

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


/* ================= EVENT GLOBAL ================= */

window.addEventListener(
  'hashchange',
  route
);

window.addEventListener(
  'DOMContentLoaded',
  load
);
