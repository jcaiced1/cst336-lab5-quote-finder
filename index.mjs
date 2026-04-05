import Database from "better-sqlite3";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { authors, categories, quotes } from "./data/seed.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, "data", "quotes.sqlite");
const db = new Database(dbPath);

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

  const authorCount = db.prepare("SELECT COUNT(*) AS count FROM authors").get().count;
  if (authorCount > 0) {
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
        (SELECT ROUND(AVG(likes)) FROM quotes) AS averageLikes
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
    conditions.push("q.quote LIKE @keyword");
    params.keyword = `%${filters.keyword}%`;
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
  const results = searchQuotes(filters);
  const hasSearch =
    filters.keyword ||
    filters.categoryId ||
    filters.authorId ||
    filters.minLikes !== "" ||
    filters.maxLikes !== "";

  return res.render("index", {
    title: "Quote Finder",
    filters,
    hasSearch,
    results,
    resultCount: results.length,
    filterOptions: getFilterOptions(),
    metrics: getMetrics(),
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
