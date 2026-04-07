import Database from "better-sqlite3";
import express from "express";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

import { authors as seedAuthors, categories as seedCategories, quotes as seedQuotes } from "./data/seed.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, "data", "quotes.sqlite");
const archivePath = path.join(__dirname, "data", "quote-archive.json");
const db = new Database(dbPath);
const dataset = fs.existsSync(archivePath)
  ? JSON.parse(fs.readFileSync(archivePath, "utf8"))
  : { authors: seedAuthors, categories: seedCategories, quotes: seedQuotes };
const { authors, categories, quotes } = dataset;

app.locals.courseName = "CST336";
app.locals.studentName = "Jose Caicedo";
app.locals.schoolName = "CSUMB";
app.locals.currentYear = new Date().getFullYear();
app.locals.appName = "Signal & Spark Quote Atlas";
app.locals.formatYear = (year) => (year < 0 ? `${Math.abs(year)} BCE` : `${year}`);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

function formatYear(year) {
  if (!year && year !== 0) {
    return "Year unknown";
  }

  return year < 100 ? `${year} CE` : `${year}`;
}

function generatePortraitDataUri(name, color) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="36" fill="${color}" />
      <circle cx="120" cy="92" r="46" fill="rgba(255,255,255,0.18)" />
      <path d="M48 206c10-34 41-54 72-54s62 20 72 54" fill="rgba(255,255,255,0.18)" />
      <text x="120" y="132" text-anchor="middle" fill="#fff8f1" font-family="Georgia, serif" font-size="66" font-weight="700">
        ${initials}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function assignCategory(quote) {
  const text = quote.toLowerCase();

  if (/(justice|right|rights|freedom|truth|hate|darkness|silence|law|fair|equal)/.test(text)) {
    return 5;
  }

  if (/(love|heart|kindness|faith|hope|peace|compassion|friend|soul)/.test(text)) {
    return 6;
  }

  if (/(lead|leader|leadership|team|service|example|responsibility|courage)/.test(text)) {
    return 3;
  }

  if (/(create|art|book|imagin|write|music|dream|invent|design)/.test(text)) {
    return 4;
  }

  if (/(curious|understand|learn|study|question|idea|discover|knowledge|science)/.test(text)) {
    return 2;
  }

  return 1;
}

function buildLargeDataset(rawItems) {
  const cleaned = rawItems
    .filter((item) => item?.quoteText && item?.quoteAuthor)
    .map((item) => ({
      quote: item.quoteText.trim().replace(/\s+/g, " "),
      author: item.quoteAuthor.trim(),
    }))
    .filter((item) => item.quote.length >= 18 && item.author.length >= 2);

  const byAuthor = new Map();
  for (const item of cleaned) {
    const list = byAuthor.get(item.author) || [];
    list.push(item);
    byAuthor.set(item.author, list);
  }

  const rankedAuthors = [...byAuthor.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const selectedQuotes = [];
  const selectedAuthors = new Set();

  for (const [author, list] of rankedAuthors) {
    const uniqueQuotes = [];
    const seen = new Set();

    for (const item of list) {
      const key = item.quote.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueQuotes.push(item);
      }
    }

    uniqueQuotes
      .sort((a, b) => a.quote.length - b.quote.length)
      .slice(0, 6)
      .forEach((item) => {
        selectedQuotes.push(item);
        selectedAuthors.add(author);
      });

    if (selectedQuotes.length >= 650 && selectedAuthors.size >= 120) {
      break;
    }
  }

  const categories = [
    { id: 1, name: "Resilience", accent: "#ff7a59" },
    { id: 2, name: "Curiosity", accent: "#3fa7d6" },
    { id: 3, name: "Leadership", accent: "#f4b942" },
    { id: 4, name: "Creativity", accent: "#c56cf0" },
    { id: 5, name: "Justice", accent: "#2fbf71" },
    { id: 6, name: "Love & Faith", accent: "#ff5964" },
  ];

  const authorStats = new Map();
  const quotes = selectedQuotes.map((item, index) => {
    const categoryId = assignCategory(item.quote);
    const stats = authorStats.get(item.author) || { total: 0, categories: new Map() };
    stats.total += 1;
    stats.categories.set(categoryId, (stats.categories.get(categoryId) || 0) + 1);
    authorStats.set(item.author, stats);

    return {
      id: index + 1,
      quote: item.quote,
      likes: 620 + ((item.quote.length * 11 + index * 17) % 380),
      authorName: item.author,
      category_id: categoryId,
      context_year: 1900 + (index % 121),
    };
  });

  const palette = ["#ff7a59", "#3fa7d6", "#f4b942", "#c56cf0", "#2fbf71", "#ff5964"];
  const authors = [...selectedAuthors].sort((a, b) => a.localeCompare(b)).map((name, index) => {
    const stats = authorStats.get(name);
    const topCategoryId =
      [...stats.categories.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 1;
    const topCategory = categories.find((category) => category.id === topCategoryId)?.name || "Resilience";
    const color = palette[index % palette.length];

    return {
      id: index + 1,
      name,
      birth_year: null,
      death_year: null,
      nationality: "Quote Archive",
      portrait_url: generatePortraitDataUri(name, color),
      bio: `${name} is included in the Signal & Spark archive for memorable lines that continue to appear in modern quote collections.`,
      spotlight: `This author appears frequently in the ${topCategory} lane of the archive, which makes them useful for keyword and theme-based searches.`,
    };
  });

  const authorIdByName = new Map(authors.map((author) => [author.name, author.id]));

  return {
    authors,
    categories,
    quotes: quotes.map((quote) => ({
      id: quote.id,
      quote: quote.quote,
      likes: quote.likes,
      author_id: authorIdByName.get(quote.authorName),
      category_id: quote.category_id,
      context_year: quote.context_year,
    })),
  };
}

function initializeDatabase() {
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS authors (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      birth_year INTEGER,
      death_year INTEGER,
      nationality TEXT NOT NULL,
      portrait_url TEXT NOT NULL,
      bio TEXT NOT NULL,
      spotlight TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      accent TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY,
      quote TEXT NOT NULL,
      likes INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      context_year INTEGER,
      FOREIGN KEY (author_id) REFERENCES authors(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

  const counts = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM authors) AS authorCount,
        (SELECT COUNT(*) FROM categories) AS categoryCount,
        (SELECT COUNT(*) FROM quotes) AS quoteCount
    `)
    .get();

  const seedMatches =
    counts.authorCount === authors.length &&
    counts.categoryCount === categories.length &&
    counts.quoteCount === quotes.length;

  if (seedMatches) {
    return;
  }

  const insertAuthor = db.prepare(`
    INSERT INTO authors (id, name, birth_year, death_year, nationality, portrait_url, bio, spotlight)
    VALUES (@id, @name, @birth_year, @death_year, @nationality, @portrait_url, @bio, @spotlight)
  `);
  const insertCategory = db.prepare(`
    INSERT INTO categories (id, name, accent)
    VALUES (@id, @name, @accent)
  `);
  const insertQuote = db.prepare(`
    INSERT INTO quotes (id, quote, likes, author_id, category_id, context_year)
    VALUES (@id, @quote, @likes, @author_id, @category_id, @context_year)
  `);

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM quotes").run();
    db.prepare("DELETE FROM authors").run();
    db.prepare("DELETE FROM categories").run();

    authors.forEach((author) => insertAuthor.run(author));
    categories.forEach((category) => insertCategory.run(category));
    quotes.forEach((quote) => insertQuote.run(quote));
  });

  transaction();
}

initializeDatabase();

function normalizeSearch(query = {}) {
  const keyword = query.keyword?.trim() || "";
  const categoryId = Number.parseInt(query.categoryId, 10) || "";
  const authorId = Number.parseInt(query.authorId, 10) || "";
  const keywordTextOnly = query.keywordTextOnly === "on";
  const minLikes =
    query.minLikes !== undefined && query.minLikes !== ""
      ? Number.parseInt(query.minLikes, 10)
      : "";
  const maxLikes =
    query.maxLikes !== undefined && query.maxLikes !== ""
      ? Number.parseInt(query.maxLikes, 10)
      : "";

  return {
    keyword,
    categoryId,
    authorId,
    keywordTextOnly,
    minLikes: Number.isNaN(minLikes) ? "" : minLikes,
    maxLikes: Number.isNaN(maxLikes) ? "" : maxLikes,
  };
}

function getFilterOptions() {
  return {
    categories: db.prepare("SELECT id, name, accent FROM categories ORDER BY name").all(),
    authors: db.prepare("SELECT id, name FROM authors ORDER BY name").all(),
  };
}

function getMetrics() {
  return db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM quotes) AS quoteCount,
        (SELECT COUNT(*) FROM authors) AS authorCount,
        (SELECT COUNT(*) FROM categories) AS categoryCount,
        (SELECT ROUND(AVG(likes)) FROM quotes) AS averageLikes,
        (SELECT MIN(likes) FROM quotes) AS minLikes,
        (SELECT MAX(likes) FROM quotes) AS maxLikes
    `)
    .get();
}

function getFeaturedCategories() {
  return db
    .prepare(`
      SELECT c.name, c.accent, COUNT(q.id) AS totalQuotes
      FROM categories c
      LEFT JOIN quotes q ON q.category_id = c.id
      GROUP BY c.id
      ORDER BY totalQuotes DESC, c.name ASC
      LIMIT 4
    `)
    .all();
}

function searchQuotes(filters) {
  const conditions = [];
  const params = {};

  if (filters.keyword) {
    const terms = filters.keyword
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    terms.forEach((term, index) => {
      const key = `keyword${index}`;
      const keywordCondition = filters.keywordTextOnly
        ? `LOWER(q.quote) LIKE @${key}`
        : `
          (
            LOWER(q.quote) LIKE @${key}
            OR LOWER(a.name) LIKE @${key}
            OR LOWER(c.name) LIKE @${key}
          )
        `;
      conditions.push(keywordCondition);
      params[key] = `%${term}%`;
    });
  }

  if (filters.categoryId) {
    conditions.push("q.category_id = @categoryId");
    params.categoryId = filters.categoryId;
  }

  if (filters.authorId) {
    conditions.push("q.author_id = @authorId");
    params.authorId = filters.authorId;
  }

  if (filters.minLikes !== "") {
    conditions.push("q.likes >= @minLikes");
    params.minLikes = filters.minLikes;
  }

  if (filters.maxLikes !== "") {
    conditions.push("q.likes <= @maxLikes");
    params.maxLikes = filters.maxLikes;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  return db
    .prepare(`
      SELECT
        q.id,
        q.quote,
        q.likes,
        q.context_year AS contextYear,
        a.id AS authorId,
        a.name AS authorName,
        c.id AS categoryId,
        c.name AS categoryName,
        c.accent AS categoryAccent
      FROM quotes q
      JOIN authors a ON a.id = q.author_id
      JOIN categories c ON c.id = q.category_id
      ${whereClause}
      ORDER BY q.likes DESC, a.name ASC
    `)
    .all(params);
}

function hasActiveFilters(filters) {
  return Boolean(
    filters.keyword ||
      filters.categoryId ||
      filters.authorId ||
      filters.minLikes !== "" ||
      filters.maxLikes !== ""
  );
}

function getTopQuote() {
  return db
    .prepare(`
      SELECT q.quote, q.likes, a.name AS authorName
      FROM quotes q
      JOIN authors a ON a.id = q.author_id
      ORDER BY q.likes DESC
      LIMIT 1
    `)
    .get();
}

app.get("/", (req, res) => {
  const filters = normalizeSearch(req.query);
  const hasQueryParams = Object.keys(req.query).length > 0;
  const hasSearch = hasActiveFilters(filters);
  const results = hasSearch ? searchQuotes(filters) : [];
  const validationError = hasQueryParams && !hasSearch
    ? "Choose at least one filter before searching."
    : null;
  const metrics = getMetrics();

  return res.render("index", {
    title: "Quote Finder",
    filters,
    hasSearch,
    validationError,
    results,
    resultCount: results.length,
    filterOptions: getFilterOptions(),
    metrics,
    featuredCategories: getFeaturedCategories(),
    topQuote: getTopQuote(),
    formatYear,
  });
});

app.get("/api/authors/:id", (req, res) => {
  const authorId = Number.parseInt(req.params.id, 10);
  const author = db
    .prepare(`
      SELECT
        a.id,
        a.name,
        a.birth_year AS birthYear,
        a.death_year AS deathYear,
        a.nationality,
        a.portrait_url AS portraitUrl,
        a.bio,
        a.spotlight,
        COUNT(q.id) AS quoteCount,
        MAX(q.likes) AS highestLikes
      FROM authors a
      LEFT JOIN quotes q ON q.author_id = a.id
      WHERE a.id = ?
      GROUP BY a.id
    `)
    .get(authorId);

  if (!author) {
    return res.status(404).json({ error: "Author not found" });
  }

  return res.json({
    ...author,
    fallbackPortraitUrl: generatePortraitDataUri(author.name, "#8a5a44"),
    displayYears:
      author.birthYear || author.deathYear
        ? [
            author.birthYear < 0 ? `${Math.abs(author.birthYear)} BCE` : author.birthYear,
            author.deathYear < 0 ? `${Math.abs(author.deathYear)} BCE` : author.deathYear,
          ]
            .filter(Boolean)
            .join(" - ")
        : "Dates unavailable",
  });
});

app.use((req, res) => {
  return res.status(404).render("not-found", {
    title: "Page Not Found",
  });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`Quote Finder running on http://localhost:${PORT}`);
  });
}

export default app;
