import "dotenv/config";
import express from "express";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: 10,
  waitForConnections: true
});

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
    maxLikes: Number.isNaN(maxLikes) ? "" : maxLikes
  };
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

async function getFilterOptions() {
  const [categories] = await pool.query(
    "SELECT id, name, accent FROM lab5_categories ORDER BY name"
  );
  const [authors] = await pool.query(
    "SELECT id, name FROM lab5_authors ORDER BY name"
  );

  return { categories, authors };
}

async function getMetrics() {
  const [[metrics]] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM lab5_quotes) AS quoteCount,
      (SELECT COUNT(*) FROM lab5_authors) AS authorCount,
      (SELECT COUNT(*) FROM lab5_categories) AS categoryCount,
      (SELECT ROUND(AVG(likes)) FROM lab5_quotes) AS averageLikes,
      (SELECT MIN(likes) FROM lab5_quotes) AS minLikes,
      (SELECT MAX(likes) FROM lab5_quotes) AS maxLikes
  `);
  return metrics;
}

async function getFeaturedCategories() {
  const [rows] = await pool.query(`
    SELECT c.name, c.accent, COUNT(q.id) AS totalQuotes
    FROM lab5_categories c
    LEFT JOIN lab5_quotes q ON q.category_id = c.id
    GROUP BY c.id, c.name, c.accent
    ORDER BY totalQuotes DESC, c.name ASC
    LIMIT 4
  `);
  return rows;
}

async function getTopQuote() {
  const [[row]] = await pool.query(`
    SELECT q.quote, q.likes, a.name AS authorName
    FROM lab5_quotes q
    JOIN lab5_authors a ON a.id = q.author_id
    ORDER BY q.likes DESC
    LIMIT 1
  `);
  return row;
}

async function searchQuotes(filters) {
  const conditions = [];
  const params = [];

  if (filters.keyword) {
    const terms = filters.keyword
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    terms.forEach((term) => {
      if (filters.keywordTextOnly) {
        conditions.push("LOWER(q.quote) LIKE ?");
        params.push(`%${term}%`);
      } else {
        conditions.push("(LOWER(q.quote) LIKE ? OR LOWER(a.name) LIKE ? OR LOWER(c.name) LIKE ?)");
        params.push(`%${term}%`, `%${term}%`, `%${term}%`);
      }
    });
  }

  if (filters.categoryId) {
    conditions.push("q.category_id = ?");
    params.push(filters.categoryId);
  }

  if (filters.authorId) {
    conditions.push("q.author_id = ?");
    params.push(filters.authorId);
  }

  if (filters.minLikes !== "") {
    conditions.push("q.likes >= ?");
    params.push(filters.minLikes);
  }

  if (filters.maxLikes !== "") {
    conditions.push("q.likes <= ?");
    params.push(filters.maxLikes);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `
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
      FROM lab5_quotes q
      JOIN lab5_authors a ON a.id = q.author_id
      JOIN lab5_categories c ON c.id = q.category_id
      ${whereClause}
      ORDER BY q.likes DESC, a.name ASC
    `,
    params
  );

  return rows;
}

app.get("/", async (req, res, next) => {
  try {
    const filters = normalizeSearch(req.query);
    const hasQueryParams = Object.keys(req.query).length > 0;
    const hasSearch = hasActiveFilters(filters);
    const results = hasSearch ? await searchQuotes(filters) : [];
    const validationError = hasQueryParams && !hasSearch
      ? "Choose at least one filter before searching."
      : null;

    res.render("index", {
      title: "Quote Finder",
      filters,
      hasSearch,
      validationError,
      results,
      resultCount: results.length,
      filterOptions: await getFilterOptions(),
      metrics: await getMetrics(),
      featuredCategories: await getFeaturedCategories(),
      topQuote: await getTopQuote(),
      formatYear
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/authors/:id", async (req, res, next) => {
  try {
    const authorId = Number.parseInt(req.params.id, 10);
    const [[author]] = await pool.query(
      `
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
        FROM lab5_authors a
        LEFT JOIN lab5_quotes q ON q.author_id = a.id
        WHERE a.id = ?
        GROUP BY a.id, a.name, a.birth_year, a.death_year, a.nationality, a.portrait_url, a.bio, a.spotlight
      `,
      [authorId]
    );

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
              author.deathYear < 0 ? `${Math.abs(author.deathYear)} BCE` : author.deathYear
            ]
              .filter(Boolean)
              .join(" - ")
          : "Dates unavailable"
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).render("not-found", {
    title: "Page Not Found"
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).send("Server error");
});

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`Quote Finder running on http://localhost:${PORT}`);
  });
}

export default app;
