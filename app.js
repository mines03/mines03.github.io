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
    : 'Blog Saya';


/*
 * Jika TARGET_URL belum didefinisikan di file lain,
 * gunakan file artikel.org di lokasi yang sama.
 */
const ORG_FILE_URL =
  typeof window.TARGET_URL !== 'undefined'
    ? window.TARGET_URL
    : 'artikel.org';


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
   Parser tag Org-mode
========================================================= */

function parseOrgTags(value) {
  const source = String(value || '').trim();

  if (!source) {
    return [];
  }

  /*
   * Contoh:
   * :fantasy:books:
   */
  if (
    source.startsWith(':') &&
    source.endsWith(':')
  ) {
    return source
      .split(':')
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  /*
   * Contoh:
   * [fantasy, books]
   * ["fantasy", "books"]
   */
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

  /*
   * Contoh:
   * fantasy, books
   */
  return source
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}


/* =========================================================
   Parser headline Org-mode
========================================================= */

function parseHeadlineTitle(rawTitle) {
  let title = String(rawTitle || '').trim();
  let tags = [];

  /*
   * Format:
   *
   * ** Judul artikel :tag1:tag2:tag3:
   *
   * Regex menangkap seluruh blok tag di bagian akhir
   * headline, bukan hanya satu tag.
   */
  const tagMatch = title.match(
    /\s+((?::[\w@#%+\-]+)+:)\s*$/
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
   Parser utama Org-mode
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
    const normalized = normalizeSection(section);

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
     * :LAYOUT: memiliki prioritas.
     * Jika tidak ada, layout ditentukan dari kategori.
     */
    currentArticle.layout = normalizeLayout(
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

    /*
     * Gabungkan tag dari headline,
     * :TAGS:, dan :CATEGORIES:.
     */
    const propertyTags = [];

    if (currentArticle.props.tags) {
      propertyTags.push(
        ...parseOrgTags(currentArticle.props.tags)
      );
    }

    if (currentArticle.props.categories) {
      propertyTags.push(
        ...parseOrgTags(currentArticle.props.categories)
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

  const lines = String(text || '').split(/\r?\n/);

  for (const line of lines) {
    const headingMatch = line.match(
      /^(\*+)\s+(.*)$/
    );

    /*
     * Level 1 adalah kategori:
     *
     * * Artikel
     * * Buku
     */
    if (
      headingMatch &&
      headingMatch[1].length === 1
    ) {
      flushArticle();

      currentSection = headingMatch[2].trim();

      continue;
    }

    /*
     * Level 2 adalah artikel/buku:
     *
     * ** Gedung tertinggi didunia
     * ** Taiko :fantasy:books:
     */
    if (
      headingMatch &&
      headingMatch[1].length === 2
    ) {
      flushArticle();

      const parsedTitle = parseHeadlineTitle(
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
     * Level 3 dan seterusnya adalah heading
     * di dalam artikel.
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

    /*
     * Abaikan isi sebelum artikel pertama.
     */
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
     * Isi property drawer.
     */
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
   * Pastikan setiap slug unik.
   */
  const usedSlugs = new Map();

  for (const article of articles) {
    const originalSlug = article.slug;
    const count = usedSlugs.get(originalSlug) || 0;

    usedSlugs.set(originalSlug, count + 1);

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
   * [[youtube:VIDEO_ID][Tonton Video]]
   */
  source = source.replace(
    /\[\[youtube:([^\]\s]+)\]\[([^\]]*)\]\]/gi,
    function (_, videoId, text) {
      const cleanVideoId = String(videoId)
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
   * Audio:
   * [[audio:URL][Dengarkan Audio]]
   */
  source = source.replace(
    /\[\[audio:([^\]]+)\]\[([^\]]*)\]\]/gi,
    function (_, url, text) {
      const safeAudioUrl = safeUrl(url);

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
              ${safeText(text || 'Unduh audio')}
            </a>
          </audio>
        </div>
      `);
    }
  );

  /*
   * Link/image:
   * [[URL][TEKS]]
   */
  source = source.replace(
    /\[\[([^\]]+)\]\[([^\]]*)\]\]/g,
    function (_, rawUrl, rawText) {
      const url = String(rawUrl).trim();
      const text = String(rawText).trim();

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
   * Link/gambar tanpa deskripsi:
   * [[URL]]
   */
  source = source.replace(
    /\[\[([^\]]+)\]\]/g,
    function (_, rawUrl) {
      const url = String(rawUrl).trim();

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

  /*
   * Escape semua teks biasa setelah link/media
   * diamankan dan dilindungi.
   */
  source = escapeHtml(source);

  /*
   * Verbatim:
   * =kode=
   * ~kode~
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
   * Bold Org-mode:
   * *teks*
   */
  source = source.replace(
    /(^|[\s('">])\*([^*\n]+?)\*(?=$|[\s.,;:!?)'"])/g,
    '$1<strong>$2</strong>'
  );

  /*
   * Italic Org-mode:
   * /teks/
   */
  source = source.replace(
    /(^|[\s('">])\/([^\/\n]+?)\/(?=$|[\s.,;:!?)'"])/g,
    '$1<em>$2</em>'
  );

  /*
   * Underline Org-mode:
   * _teks_
   */
  source = source.replace(
    /(^|[\s('">])_([^_\n]+?)_(?=$|[\s.,;:!?)'"])/g,
    '$1<u>$2</u>'
  );

  /*
   * Kembalikan HTML terlindungi.
   */
  source = source.replace(
    /\u0000HTML_(\d+)\u0000/g,
    function (_, index) {
      return protectedHtml[Number(index)] || '';
    }
  );

  return source;
}


/* =========================================================
   Block renderer Org-mode
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
