/* ================= KONFIG ================= */

const TARGET_URL = 'https://artikel-proxy.extra03-mine.workers.dev/';

let ARTICLES = [];
let currentLayout = 'post';
let currentFilter = '';
let currentTag = '';

const app = document.getElementById('app');

const SITE_TITLE =
  typeof window.SITE_TITLE !== 'undefined'
    ? window.SITE_TITLE
    : 'Blog Udin';


/* =========================================================
   Utility
========================================================= */

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

  if (
    layout === 'book' ||
    layout === 'buku'
  ) {
    return 'book';
  }

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


function getPlaceholderImage() {
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="800"
        height="1000"
        viewBox="0 0 800 1000">

        <rect
          width="800"
          height="1000"
          fill="#e5e7eb"/>

        <text
          x="400"
          y="500"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          font-size="32"
          fill="#6b7280">
          Cover tidak tersedia
        </text>
      </svg>
    `)
  );
}


function findFirstImageUrl(raw) {
  const text = String(raw || '');

  const imageWithDescription = text.match(
    /\[\[([^\]\s]+?\.(?:jpg|jpeg|png|gif|webp|svg|avif|bmp|tif|tiff)(?:[?#].*)?)\]\[[^\]]*\]\]/i
  );

  if (imageWithDescription) {
    return imageWithDescription[1].trim();
  }

  const imageWithoutDescription = text.match(
    /\[\[([^\]\s]+?\.(?:jpg|jpeg|png|gif|webp|svg|avif|bmp|tif|tiff)(?:[?#].*)?)\]\]/i
  );

  if (imageWithoutDescription) {
    return imageWithoutDescription[1].trim();
  }

  return '';
}


function tagButton(tag) {
  const cleanTag = String(tag || '').trim();

  if (!cleanTag) {
    return '';
  }

  return `
    <button
      type="button"
      class="tag tag-button"
      data-tag="${escapeAttribute(cleanTag)}">
      ${escapeHtml(cleanTag)}
    </button>
  `;
}


/* =========================================================
   Parser tags
========================================================= */

function parseOrgTags(value) {
  const source = String(value || '').trim();

  if (!source) {
    return [];
  }

  if (
    source.startsWith(':') &&
    source.endsWith(':')
  ) {
    return source
      .split(':')
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  if (
    source.startsWith('[') &&
    source.endsWith(']')
  ) {
    return source
      .slice(1, -1)
      .split(',')
      .map(tag => {
        return tag
          .trim()
          .replace(/^["']|["']$/g, '');
      })
      .filter(Boolean);
  }

  return source
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}


function parseHeadlineTitle(rawTitle) {
  let title = String(rawTitle || '').trim();
  let tags = [];

  /*
   * Mendukung:
   *
   * ** Taiko :fantasy:books:
   * ** Judul :tag-satu:tag_dua:
   */
  const tagMatch = title.match(
    /\s+((?::[\w@#%+_-]+)+:)\s*$/
  );

  if (tagMatch) {
    const tagBlock = tagMatch[1];

    title = title
      .slice(0, tagMatch.index)
      .trim();

    tags = tagBlock
      .split(':')
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  return {
    title,
    tags
  };
}


/* =========================================================
   Parser Org-mode
========================================================= */

function parseOrg(text) {
  const articles = [];

  let currentArticle = null;
  let buffer = [];
  let insideDrawer = false;
  let currentSection = '';

  function normalizeSection(value) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  function getSectionLayout(section) {
    const normalized =
      normalizeSection(section);

    if (
      normalized === 'buku' ||
      normalized === 'book' ||
      normalized === '_books'
    ) {
      return 'book';
    }

    return 'post';
  }

  function flushArticle() {
    if (!currentArticle) {
      return;
    }

    currentArticle.raw =
      buffer.join('\n').trim();

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

    currentArticle.layout =
      normalizeLayout(
        currentArticle.props.layout ||
        getSectionLayout(currentArticle.section)
      );

    currentArticle.author =
      currentArticle.props.author ||
      currentArticle.props.penulis ||
      '';

    currentArticle.cover =
      currentArticle.props.cover ||
      currentArticle.props.image ||
      currentArticle.props.gambar ||
      currentArticle.props.img ||
      findFirstImageUrl(currentArticle.raw);

    const propertyTags = [];

    if (currentArticle.props.tags) {
      propertyTags.push(
        ...parseOrgTags(
          currentArticle.props.tags
        )
      );
    }

    if (currentArticle.props.categories) {
      propertyTags.push(
        ...parseOrgTags(
          currentArticle.props.categories
        )
      );
    }

    currentArticle.tags = [
      ...new Set(
        [
          ...currentArticle.tags,
          ...propertyTags
        ]
          .map(tag => String(tag).trim())
          .filter(Boolean)
      )
    ];

    articles.push(currentArticle);

    currentArticle = null;
    buffer = [];
    insideDrawer = false;
  }

  const lines = String(text || '')
    .split(/\r?\n/);

  for (const line of lines) {
    const headingMatch = line.match(
      /^(\*+)\s+(.*)$/
    );

    /*
     * Level 1:
     * * Artikel
     * * Buku
     */
    if (
      headingMatch &&
      headingMatch[1].length === 1
    ) {
      flushArticle();

      currentSection =
        headingMatch[2].trim();

      continue;
    }

    /*
     * Level 2:
     * ** Judul artikel
     * ** Judul buku :tag1:tag2:
     */
    if (
      headingMatch &&
      headingMatch[1].length === 2
    ) {
      flushArticle();

      const parsedTitle =
        parseHeadlineTitle(
          headingMatch[2]
        );

      currentArticle = {
        title: parsedTitle.title,
        tags: parsedTitle.tags,
        props: {},
        section: currentSection
      };

      buffer = [];
      insideDrawer = false;

      continue;
    }

    /*
     * Level 3 atau lebih:
     * *** Subjudul
     * **** Subjudul kecil
     */
    if (
      headingMatch &&
      headingMatch[1].length >= 3
    ) {
      if (currentArticle) {
        buffer.push(line);
      }

      continue;
    }

    if (!currentArticle) {
      continue;
    }

    /*
     * Property drawer.
     */
    if (
      /^\s*:PROPERTIES:\s*$/i.test(line)
    ) {
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
        /^\s*:([^:]+):\s*(.*)$/
      );

      if (propertyMatch) {
        const propertyName =
          propertyMatch[1]
            .trim()
            .toLowerCase();

        currentArticle.props[propertyName] =
          propertyMatch[2].trim();
      }

      continue;
    }

    buffer.push(line);
  }

  flushArticle();

  /*
   * Pastikan slug unik.
   */
  const usedSlugs = new Map();

  for (const article of articles) {
    const originalSlug = article.slug;
    const count =
      usedSlugs.get(originalSlug) || 0;

    usedSlugs.set(
      originalSlug,
      count + 1
    );

    if (count > 0) {
      article.slug =
        `${originalSlug}-${count + 1}`;
    }
  }

  return articles;
}


/* =========================================================
   Inline renderer
========================================================= */

function renderInline(input) {
  let source = String(input ?? '');
  const protectedHtml = [];

  function protect(html) {
    const token =
      `\u0000HTML_${protectedHtml.length}\u0000`;

    protectedHtml.push(html);

    return token;
  }

  function safeText(value) {
    return escapeHtml(
      String(value ?? '')
    );
  }

  function safeUrl(value) {
    const url =
      String(value || '').trim();

    if (!isSafeUrl(url)) {
      return '#';
    }

    return escapeAttribute(url);
  }

  /*
   * YouTube.
   */
  source = source.replace(
    /\[\[youtube:([^\]\s]+)\]\[([^\]]*)\]\]/gi,
    function (_, videoId, text) {
      const cleanVideoId =
        String(videoId)
          .replace(/[^\w-]/g, '');

      if (!cleanVideoId) {
        return '';
      }

      return protect(`
        <div class="youtube-embed">
          <iframe
            src="https://www.youtube.com/embed/${escapeAttribute(cleanVideoId)}"
            title="${safeText(text || 'YouTube video')}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy">
          </iframe>
        </div>
      `);
    }
  );

  /*
   * Audio.
   */
  source = source.replace(
    /\[\[audio:([^\]]+)\]\[([^\]]*)\]\]/gi,
    function (_, url, text) {
      const audioUrl = safeUrl(url);

      return protect(`
        <div class="audio-player">
          <audio controls style="width:100%;">
            <source
              src="${audioUrl}"
              type="audio/mpeg">

            Browser tidak mendukung audio.

            <a
              href="${audioUrl}"
              target="_blank"
              rel="noopener">
              ${safeText(text || 'Dengarkan audio')}
            </a>
          </audio>
        </div>
      `);
    }
  );

  /*
   * Link atau gambar dengan deskripsi.
   */
  source = source.replace(
    /\[\[([^\]]+)\]\[([^\]]*)\]\]/g,
    function (_, rawUrl, rawText) {
      const url =
        String(rawUrl).trim();

      const text =
        String(rawText).trim();

      if (!isSafeUrl(url)) {
        return safeText(text || url);
      }

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
   * Link atau gambar tanpa deskripsi.
   */
  source = source.replace(
    /\[\[([^\]]+)\]\]/g,
    function (_, rawUrl) {
      const url =
        String(rawUrl).trim();

      if (!isSafeUrl(url)) {
        return safeText(url);
      }

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

  source = escapeHtml(source);

  /*
   * Verbatim.
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
   * Bold Org-mode.
   */
  source = source.replace(
    /(^|[\s('">])\*([^*\n]+?)\*(?=$|[\s.,;:!?)'"])/g,
    '$1<strong>$2</strong>'
  );

  /*
   * Italic Org-mode.
   */
  source = source.replace(
    /(^|[\s('">])\/([^\/\n]+?)\/(?=$|[\s.,;:!?)'"])/g,
    '$1<em>$2</em>'
  );

  /*
   * Underline Org-mode.
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
      return protectedHtml[
        Number(index)
      ] || '';
    }
  );

  return source;
}


/* =========================================================
   Renderer blok Org-mode
========================================================= */

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

    if (!rows.length) {
      tableRows = null;
      return;
    }

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
    const rawLine of String(source || '')
      .split(/\r?\n/)
  ) {
    const line =
      rawLine.replace(/\s+$/, '');

    let match;

    /*
     * Blok source/example.
     */
    if (codeBlock !== null) {
      if (
        /^\s*#\+END_(SRC|EXAMPLE)\s*$/i.test(line)
      ) {
        output.push(
          '<pre><code>' +
          escapeHtml(
            codeBlock.join('\n')
          ) +
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
     * Blok quote.
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
     * Property drawer.
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
      /^\s*:PROPERTIES:\s*$/i.test(line)
    ) {
      closeParagraph();
      closeList();
      closeTable();

      insideDrawer = true;
      continue;
    }

    /*
     * Tabel Org-mode.
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
     * Heading isi artikel.
     *
     * *** Subjudul = h2
     * **** Subjudul = h3
     */
    match = line.match(
      /^(\*+)\s+(.+)$/
    );

    if (match) {
      closeParagraph();
      closeList();
      closeTable();

      const sourceLevel =
        match[1].length;

      const htmlLevel = Math.min(
        Math.max(sourceLevel - 1, 2),
        6
      );

      const heading = match[2]
        .replace(
          /\s+:[\w@#%+_-]+(?::[\w@#%+_-]+)*:\s*$/,
          ''
        )
        .trim();

      output.push(
        `<h${htmlLevel}>` +
        `${renderInline(heading)}` +
        `</h${htmlLevel}>`
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
     * Keyword Org-mode.
     */
    if (/^\s*#\+/i.test(line)) {
      continue;
    }

    /*
     * Markdown heading tersisa.
     */
    if (/^\s*#\s/.test(line)) {
      continue;
    }

    if (!line.trim()) {
      closeParagraph();
      closeTable();
      continue;
    }

    paragraph.push(line.trim());
  }

  closeParagraph();
  closeList();
  closeTable();

  return output.join('\n');
}


/* =========================================================
   Excerpt
========================================================= */

function excerpt(raw, length = 180) {
  const text = String(raw || '')
    .split(/\r?\n/)
    .filter(line => {
      const trimmed = line.trim();

      return (
        trimmed &&
        !/^\*+\s+/.test(trimmed) &&
        !/^#\+/.test(trimmed) &&
        !/^:PROPERTIES:$/i.test(trimmed) &&
        !/^:END:$/i.test(trimmed) &&
        !/^\|/.test(trimmed) &&
        !/^[-+]\s+/.test(trimmed) &&
        !/^\d+[.)]\s+/.test(trimmed)
      );
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > length
    ? text.slice(0, length).trimEnd() + '…'
    : text;
}


/* =========================================================
   Filter tag
========================================================= */

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


/* =========================================================
   Load data
========================================================= */

async function load() {
  const loadingElement =
    document.getElementById('loading');

  try {
    const response = await fetch(
      TARGET_URL,
      {
        method: 'GET',
        cache: 'no-cache'
      }
    );

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
        'URL mengembalikan HTML, bukan file Org-mode. ' +
        'Pastikan endpoint mengembalikan isi artikel.org mentah.'
      );

      return;
    }

    const cleanText = rawText.replace(
      /^\uFEFF/,
      ''
    );

    ARTICLES = parseOrg(cleanText);

    ARTICLES.sort((first, second) => {
      const firstTime = first.date
        ? new Date(first.date).getTime()
        : 0;

      const secondTime = second.date
        ? new Date(second.date).getTime()
        : 0;

      return secondTime - firstTime;
    });

    if (!ARTICLES.length) {
      showError(
        'File berhasil dimuat, tetapi tidak ada artikel yang ' +
        'terdeteksi. Gunakan struktur * Artikel lalu ** Judul.'
      );

      return;
    }
  } catch (error) {
    console.error(error);

    showError(
      'Gagal memuat file: ' +
      escapeHtml(error.message) +
      '<br><br>' +
      'Periksa URL, CORS, dan respons endpoint.'
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


/* =========================================================
   Render buku
========================================================= */

function renderBookGrid(articles) {
  const placeholder =
    getPlaceholderImage();

  return `
    <div class="book-image-grid">
      ${articles
        .map(article => {
          const articleSlug =
            encodeURIComponent(
              article.slug
            );

          const imageUrl =
            article.cover || placeholder;

          return `
            <a
              class="book-image-link"
              href="#/artikel/${articleSlug}"
              title="${escapeAttribute(article.title)}"
              aria-label="Buka ${escapeAttribute(article.title)}">

              <img
                class="book-image"
                src="${escapeAttribute(imageUrl)}"
                alt="${escapeAttribute(article.title)}"
                loading="lazy"
                onerror="this.onerror=null;this.src='${placeholder}';">
            </a>
          `;
        })
        .join('')}
    </div>
  `;
}


/* =========================================================
   Render daftar
========================================================= */

function renderList() {
  document.title = SITE_TITLE;

  app.innerHTML = `
    <div class="tabs">
      <button
        type="button"
        class="tab-btn ${
          currentLayout === 'post'
            ? 'active'
            : ''
        }"
        data-layout="post">
        📝 Blog
      </button>

      <button
        type="button"
        class="tab-btn ${
          currentLayout === 'book'
            ? 'active'
            : ''
        }"
        data-layout="book">
        📖 Buku
      </button>
    </div>

    ${
      currentTag
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
        : ''
    }

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
    const query =
      currentFilter
        .toLowerCase()
        .trim();

    const selectedTag =
      normalizeTag(currentTag);

    const filteredArticles =
      ARTICLES.filter(article => {
        if (
          article.layout !== currentLayout
        ) {
          return false;
        }

        if (
          selectedTag &&
          !article.tags.some(tag => {
            return normalizeTag(tag) === selectedTag;
          })
        ) {
          return false;
        }

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
            return tag
              .toLowerCase()
              .includes(query);
          })
        );
      });

    if (!filteredArticles.length) {
      listElement.innerHTML = `
        <p>Tidak ada artikel yang cocok.</p>
      `;

      return;
    }

    if (currentLayout === 'book') {
      listElement.innerHTML =
        renderBookGrid(
          filteredArticles
        );

      return;
    }

    listElement.innerHTML =
      filteredArticles
        .map(article => {
          const articleSlug =
            encodeURIComponent(
              article.slug
            );

          const articleTags =
            article.tags
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
                  article.date ||
                  'tanpa tanggal'
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

  document
    .querySelectorAll('.tab-btn')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          currentLayout =
            button.dataset.layout;

          currentFilter = '';
          currentTag = '';

          renderList();
        }
      );
    });

  listElement.addEventListener(
    'click',
    event => {
      const tagElement =
        event.target.closest(
          '.tag-button'
        );

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

  document
    .querySelectorAll(
      '[data-action="clear-tag"]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        clearTagFilter
      );
    });

  let searchTimeout;

  const searchElement =
    document.getElementById('q');

  searchElement.addEventListener(
    'input',
    event => {
      clearTimeout(searchTimeout);

      searchTimeout = setTimeout(
        () => {
          currentFilter =
            event.target.value;

          drawList();
        },
        200
      );
    }
  );

  drawList();
}


/* =========================================================
   Render detail
========================================================= */

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

  const formattedDate =
    article.date
      ? new Date(
          `${article.date}T00:00:00`
        ).toLocaleDateString(
          'id-ID',
          {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          }
        )
      : '';

  const articleTags =
    article.tags
      .map(tag => tagButton(tag))
      .join('');

  app.innerHTML = `
    <article>
      <div class="meta">
        <a href="#/">← Kembali</a>

        ${
          formattedDate
            ? `· ${escapeHtml(formattedDate)}`
            : ''
        }

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

      ${
        article.cover
          ? `
            <div class="article-cover">
              <img
                src="${escapeAttribute(article.cover)}"
                alt="${escapeAttribute(article.title)}"
                loading="lazy"
                onerror="this.style.display='none';">
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

  document
    .querySelectorAll('.tag-button')
    .forEach(button => {
      button.addEventListener(
        'click',
        event => {
          event.preventDefault();

          currentLayout =
            article.layout;

          setTagFilter(
            button.dataset.tag || ''
          );
        }
      );
    });

  window.scrollTo(0, 0);
}


/* =========================================================
   Routing
========================================================= */

function route() {
  const hash =
    location.hash || '#/';

  const match =
    hash.match(
      /^#\/artikel\/(.+)$/
    );

  if (match) {
    renderArticle(
      decodeURIComponent(match[1])
    );
  } else {
    renderList();
  }
}


window.addEventListener(
  'hashchange',
  route
);


window.addEventListener(
  'DOMContentLoaded',
  load
);
