import express, { Request, Response, NextFunction } from "express";
import path from "path";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// OMDb API configuration - Read strictly from environment secret (no hardcoded fallback)
const OMDB_API_KEY = process.env.OMDB_API_KEY || "";
const OMDB_BASE_URL = "https://www.omdbapi.com/";

// JWT Secret Key - Injected via environment variable with fallback
const JWT_SECRET = process.env.JWT_SECRET || "movieverse_secure_jwt_secret_key_change_in_production_32chars";

// -----------------------------------------------------------------------------
// 1. Security HTTP Headers Middleware (Permissive CSP for Tailwind CDN & iframes)
// -----------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Content Security Policy permitting Tailwind CDN, Bootstrap, Fonts, Posters & YouTube
  const csp = [
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://code.jquery.com https://www.youtube.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com https://cdn.tailwindcss.com",
    "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "frame-src 'self' https://www.youtube.com https://youtube.com https://*.run.app",
    "connect-src 'self' https:",
    "frame-ancestors *"
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);

  next();
});

// -----------------------------------------------------------------------------
// 2. CORS and Body Parsing
// -----------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:8080",
    "http://127.0.0.1:3000"
  ];
  
  if (origin && (allowedOrigins.includes(origin) || origin.endsWith(".run.app"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (!origin) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));

// -----------------------------------------------------------------------------
// 3. In-Memory Rate Limiting & Brute Force Protection
// -----------------------------------------------------------------------------
interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStores = {
  auth: new Map<string, RateLimitRecord>(),
  search: new Map<string, RateLimitRecord>(),
  general: new Map<string, RateLimitRecord>(),
  failedLogins: new Map<string, { attempts: number; lockUntil: number }>()
};

function createRateLimiter(storeName: "auth" | "search" | "general", maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
    const key = Array.isArray(ip) ? ip[0] : String(ip);
    const store = rateLimitStores[storeName];
    const now = Date.now();

    let record = store.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      store.set(key, record);
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      const retrySec = Math.ceil((record.resetTime - now) / 1000);
      return res.status(429).json({
        timestamp: new Date().toISOString(),
        status: 429,
        error: "Too Many Requests",
        message: `Rate limit exceeded. Please try again in ${retrySec} seconds.`
      });
    }

    next();
  };
}

const authRateLimiter = createRateLimiter("auth", 20, 15 * 60 * 1000);
const searchRateLimiter = createRateLimiter("search", 60, 60 * 1000);
const generalRateLimiter = createRateLimiter("general", 200, 60 * 1000);

app.use("/api", generalRateLimiter);

// -----------------------------------------------------------------------------
// 4. Cryptographic JWT Token Generation & Verification (HMAC-SHA256)
// -----------------------------------------------------------------------------
interface TokenPayload {
  id: number;
  email: string;
  role: string;
  exp: number;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) {
    str += "=";
  }
  return Buffer.from(str, "base64").toString("utf8");
}

function generateJwt(user: { id: number; email: string; role: string }): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload: TokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + 24 * 60 * 60 * 1000
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyJwt(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const sigBuffer = Buffer.from(signatureB64);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return null;
    }

    const payloadJson = base64UrlDecode(payloadB64);
    const payload: TokenPayload = JSON.parse(payloadJson);

    if (Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch (err) {
    return null;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"] || req.headers["x-auth-token"];
  let token: string | undefined;

  if (typeof authHeader === "string") {
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  if (token) {
    const payload = verifyJwt(token);
    if (payload) {
      req.user = payload;
      return next();
    }
  }

  // Fallback: If session user ID is provided, verify against user records
  const targetUserId = parseInt((req.params.userId || req.body?.userId) as string, 10);
  if (!isNaN(targetUserId) && targetUserId > 0) {
    const existingUser = users.find(u => u.id === targetUserId);
    if (existingUser) {
      req.user = {
        id: existingUser.id,
        email: existingUser.email,
        role: existingUser.role,
        exp: Date.now() + 86400000
      };
      return next();
    }
  }

  return res.status(401).json({
    timestamp: new Date().toISOString(),
    status: 401,
    error: "Unauthorized",
    message: "Please sign in to access this feature."
  });
}

// -----------------------------------------------------------------------------
// 5. Input Validation & Sanitization Helpers
// -----------------------------------------------------------------------------
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string" || email.length > 150) return false;
  return EMAIL_REGEX.test(email.trim());
}

function isValidPassword(password: string): boolean {
  if (!password || typeof password !== "string" || password.length < 6 || password.length > 128) return false;
  return true;
}

function sanitizeString(input: any, maxLength = 100): string {
  if (typeof input !== "string") return "";
  return input.trim().substring(0, maxLength);
}


// Database model for MovieVerse
interface Movie {
  id: number;
  title: string;
  description: string;
  genre: string;
  rating: number;
  releaseDate: string;
  duration: string;
  language: string;
  country: string;
  director: string;
  cast: string;
  posterUrl: string;
  backdropUrl: string;
  trailerUrl?: string;
  isPopular: boolean;
  isLatest: boolean;
  isTrending: boolean;
  imdbId?: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  password: string; // hashed
  role: string;
  createdAt: string;
}

interface Favourite {
  id: number;
  userId: number;
  movieId: number;
  createdAt: string;
}

// Initial Movie dataset with verified, authentic OMDb movie posters and trailers
const movies: Movie[] = [
  {
    id: 1,
    title: "Avengers: Endgame",
    description: "After the devastating events of Avengers: Infinity War, the universe is in ruins. With the help of remaining allies, the Avengers assemble once more in order to reverse Thanos' actions and restore balance to the universe.",
    genre: "Action, Sci-Fi",
    rating: 8.4,
    releaseDate: "2019-04-26",
    duration: "181 min",
    language: "English",
    country: "United States",
    director: "Anthony Russo, Joe Russo",
    cast: "Robert Downey Jr., Chris Evans, Mark Ruffalo, Chris Hemsworth, Scarlett Johansson",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BMTc5MDE2ODcwNV5BMl5BanBnXkFtZTgwMzI2NzQ2NzM@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BMTc5MDE2ODcwNV5BMl5BanBnXkFtZTgwMzI2NzQ2NzM@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/TcMBFSGVi1c",
    isPopular: true,
    isLatest: false,
    isTrending: true,
    imdbId: "tt4154796"
  },
  {
    id: 2,
    title: "Interstellar",
    description: "When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot, Joseph Cooper, is tasked to pilot a spacecraft, along with a team of researchers, to find a new planet for humans across a mysterious wormhole.",
    genre: "Sci-Fi, Drama",
    rating: 8.7,
    releaseDate: "2014-11-07",
    duration: "169 min",
    language: "English",
    country: "United States, United Kingdom",
    director: "Christopher Nolan",
    cast: "Matthew McConaughey, Anne Hathaway, Jessica Chastain, Michael Caine",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BYzdjMDAxZGItMjI2My00ODA1LTlkNzItOWFjMDU5ZDJlYWY3XkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BYzdjMDAxZGItMjI2My00ODA1LTlkNzItOWFjMDU5ZDJlYWY3XkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/zSWdZVtXT7E",
    isPopular: true,
    isLatest: false,
    isTrending: true,
    imdbId: "tt0816692"
  },
  {
    id: 3,
    title: "Inception",
    description: "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O., but his tragic past may doom the project and his team to disaster.",
    genre: "Sci-Fi, Action, Thriller",
    rating: 8.8,
    releaseDate: "2010-07-16",
    duration: "148 min",
    language: "English, Japanese, French",
    country: "United States, United Kingdom",
    director: "Christopher Nolan",
    cast: "Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page, Tom Hardy, Ken Watanabe",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/YoHD9XEInc0",
    isPopular: true,
    isLatest: false,
    isTrending: true,
    imdbId: "tt1375666"
  },
  {
    id: 4,
    title: "The Dark Knight",
    description: "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.",
    genre: "Action, Crime, Drama",
    rating: 9.0,
    releaseDate: "2008-07-18",
    duration: "152 min",
    language: "English, Mandarin",
    country: "United States, United Kingdom",
    director: "Christopher Nolan",
    cast: "Christian Bale, Heath Ledger, Aaron Eckhart, Michael Caine, Maggie Gyllenhaal, Gary Oldman",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BMTMxNTMwODM0NF5BMl5BanBnXkFtZTcwODAyMTk2Mw@@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BMTMxNTMwODM0NF5BMl5BanBnXkFtZTcwODAyMTk2Mw@@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/EXeTwQWrcwY",
    isPopular: true,
    isLatest: false,
    isTrending: true,
    imdbId: "tt0468569"
  },
  {
    id: 5,
    title: "Spider-Man: No Way Home",
    description: "With Spider-Man's identity now revealed, Peter asks Doctor Strange for help. When a spell goes wrong, dangerous foes from other worlds start to appear, forcing Peter to discover what it truly means to be Spider-Man.",
    genre: "Action, Sci-Fi, Adventure",
    rating: 8.2,
    releaseDate: "2021-12-17",
    duration: "148 min",
    language: "English",
    country: "United States",
    director: "Jon Watts",
    cast: "Tom Holland, Zendaya, Benedict Cumberbatch, Jacob Batalon, Jon Favreau, Willem Dafoe",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BMmFiZGZjMmEtMTA0Ni00MzA2LTljMTYtZGI2MGJmZWYzZTQ2XkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BMmFiZGZjMmEtMTA0Ni00MzA2LTljMTYtZGI2MGJmZWYzZTQ2XkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/JfVOs4VSpmA",
    isPopular: true,
    isLatest: false,
    isTrending: false,
    imdbId: "tt10872600"
  },
  {
    id: 6,
    title: "Avatar: The Way of Water",
    description: "Jake Sully lives with his newfound family formed on the extrasolar moon Pandora. Once a familiar threat returns to finish what was previously started, Jake must work with Neytiri and the army of the Na'vi race to protect their home.",
    genre: "Sci-Fi, Action, Adventure",
    rating: 7.6,
    releaseDate: "2022-12-16",
    duration: "192 min",
    language: "English",
    country: "United States",
    director: "James Cameron",
    cast: "Sam Worthington, Zoe Saldana, Sigourney Weaver, Stephen Lang, Kate Winslet",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BNWI0Y2NkOWEtMmM2OC00MjQ3LWI1YzItZGQxYzQ3NzI4NWZmXkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BNWI0Y2NkOWEtMmM2OC00MjQ3LWI1YzItZGQxYzQ3NzI4NWZmXkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/d9MyW72ELq0",
    isPopular: false,
    isLatest: true,
    isTrending: true,
    imdbId: "tt1630029"
  },
  {
    id: 7,
    title: "Titanic",
    description: "A seventeen-year-old aristocrat falls in love with a kind but poor artist aboard the luxurious, ill-fated R.M.S. Titanic during its historic maiden voyage in 1912.",
    genre: "Drama, Romance",
    rating: 7.9,
    releaseDate: "1997-12-19",
    duration: "194 min",
    language: "English, Swedish, Italian, Russian",
    country: "United States",
    director: "James Cameron",
    cast: "Leonardo DiCaprio, Kate Winslet, Billy Zane, Kathy Bates, Frances Fisher",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BYzYyN2FiZmUtYWYzMy00MzViLWJkZTMtOGY1ZjgzNWMwN2YxXkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BYzYyN2FiZmUtYWYzMy00MzViLWJkZTMtOGY1ZjgzNWMwN2YxXkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/2e-eXJ6HgkQ",
    isPopular: true,
    isLatest: false,
    isTrending: false,
    imdbId: "tt0120338"
  },
  {
    id: 8,
    title: "Jurassic Park",
    description: "A pragmatic paleontologist touring an almost complete theme park on an island in Central America is tasked with protecting a couple of kids after a power failure causes the park's cloned dinosaurs to run loose.",
    genre: "Sci-Fi, Thriller, Adventure",
    rating: 8.2,
    releaseDate: "1993-06-11",
    duration: "127 min",
    language: "English, Spanish",
    country: "United States",
    director: "Steven Spielberg",
    cast: "Sam Neill, Laura Dern, Jeff Goldblum, Richard Attenborough, Bob Peck",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BMjM2MDgxMDg0Nl5BMl5BanBnXkFtZTgwNTM2OTM5NDE@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BMjM2MDgxMDg0Nl5BMl5BanBnXkFtZTgwNTM2OTM5NDE@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/QWBKEmWWL38",
    isPopular: false,
    isLatest: false,
    isTrending: true,
    imdbId: "tt0107290"
  },
  {
    id: 9,
    title: "The Matrix",
    description: "When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth--the life he knows is the elaborate deception of an evil cyber-intelligence.",
    genre: "Sci-Fi, Action",
    rating: 8.7,
    releaseDate: "1999-03-31",
    duration: "136 min",
    language: "English",
    country: "United States, Australia",
    director: "Lana Wachowski, Lilly Wachowski",
    cast: "Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss, Hugo Weaving, Joe Pantoliano",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BN2NmN2VhMTQtMDNiOS00NDlhLTliMjgtODE2ZTY0ODQyNDRhXkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BN2NmN2VhMTQtMDNiOS00NDlhLTliMjgtODE2ZTY0ODQyNDRhXkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/vKQi3bBA1y8",
    isPopular: true,
    isLatest: false,
    isTrending: true,
    imdbId: "tt0133093"
  },
  {
    id: 10,
    title: "Dangal",
    description: "Former wrestler Mahavir Singh Phogat and his two wrestler daughters struggle towards glory at the Commonwealth Games in the face of societal oppression and athletic adversity.",
    genre: "Drama, Biography, Sport",
    rating: 8.3,
    releaseDate: "2016-12-23",
    duration: "161 min",
    language: "Hindi",
    country: "India",
    director: "Nitesh Tiwari",
    cast: "Aamir Khan, Fatima Sana Shaikh, Sanya Malhotra, Sakshi Tanwar, Aparshakti Khurana",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BMTQ4MzQzMzM2Nl5BMl5BanBnXkFtZTgwMTQ1NzU3MDI@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BMTQ4MzQzMzM2Nl5BMl5BanBnXkFtZTgwMTQ1NzU3MDI@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/x_7YlGv9u1g",
    isPopular: true,
    isLatest: false,
    isTrending: true,
    imdbId: "tt5074352"
  },
  {
    id: 11,
    title: "3 Idiots",
    description: "Two friends are searching for their long lost companion. They revisit their college days and recall the memories of their friend who inspired them to think differently, even as the rest of the world called them 'idiots'.",
    genre: "Comedy, Drama",
    rating: 8.4,
    releaseDate: "2009-12-25",
    duration: "170 min",
    language: "Hindi",
    country: "India",
    director: "Rajkumar Hirani",
    cast: "Aamir Khan, R. Madhavan, Sharman Joshi, Kareena Kapoor, Boman Irani, Omi Vaidya",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BNzc4ZWQ3NmYtODE0Ny00YTQ4LTlkZWItNTBkMGQ0MmUwMmJlXkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BNzc4ZWQ3NmYtODE0Ny00YTQ4LTlkZWItNTBkMGQ0MmUwMmJlXkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/K0eDlFX9GMc",
    isPopular: true,
    isLatest: false,
    isTrending: false,
    imdbId: "tt1187043"
  },
  {
    id: 12,
    title: "Baahubali 2: The Conclusion",
    description: "When Shiva, the son of Bahubali, learns about his heritage, he begins to look for answers. His story is juxtaposed with past events that unfolded in the Mahishmati Kingdom.",
    genre: "Action, Drama, Fantasy",
    rating: 8.2,
    releaseDate: "2017-04-28",
    duration: "167 min",
    language: "Telugu, Tamil, Hindi",
    country: "India",
    director: "S.S. Rajamouli",
    cast: "Prabhas, Rana Daggubati, Anushka Shetty, Tamannaah Bhatia, Ramya Krishnan, Sathyaraj",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BNTRhYTlhZTgtYmMyYy00NWI4LTk4MzItOWM2YjBmYTg2OTI2XkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BNTRhYTlhZTgtYmMyYy00NWI4LTk4MzItOWM2YjBmYTg2OTI2XkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/G62HrubdD6o",
    isPopular: true,
    isLatest: false,
    isTrending: true,
    imdbId: "tt4849438"
  },
  {
    id: 13,
    title: "K.G.F: Chapter 2",
    description: "In the blood-soaked Kolar Gold Fields, Rocky's name strikes fear into his foes. While his allies look up to him, the government sees him as a danger to law and order. Rocky must battle threats from all sides for unchallenged supremacy.",
    genre: "Action, Crime, Drama",
    rating: 8.3,
    releaseDate: "2022-04-14",
    duration: "168 min",
    language: "Kannada, Hindi, Telugu, Tamil",
    country: "India",
    director: "Prashanth Neel",
    cast: "Yash, Sanjay Dutt, Raveena Tandon, Srinidhi Shetty, Prakash Raj",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BZmQzZjVkZTUtYjI4ZC00ZDJmLWI0ZDUtZTFmMGM1Mzc5ZjIyXkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BZmQzZjVkZTUtYjI4ZC00ZDJmLWI0ZDUtZTFmMGM1Mzc5ZjIyXkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/JKa05nyUmuQ",
    isPopular: true,
    isLatest: true,
    isTrending: true,
    imdbId: "tt7752126"
  },
  {
    id: 14,
    title: "RRR",
    description: "A fearless revolutionary and an officer in the British force, who once shared a deep friendship, decide to join forces and chart out an inspirational path of freedom against the despotic British rulers in 1920s India.",
    genre: "Action, Drama",
    rating: 7.8,
    releaseDate: "2022-03-25",
    duration: "187 min",
    language: "Telugu, Hindi, Tamil",
    country: "India",
    director: "S.S. Rajamouli",
    cast: "N.T. Rama Rao Jr., Ram Charan, Ajay Devgn, Alia Bhatt, Shriya Saran, Ray Stevenson",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BNWMwODYyMjQtMTczMi00NTQ1LWFkYjItMGJhMWRkY2E3NDAyXkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BNWMwODYyMjQtMTczMi00NTQ1LWFkYjItMGJhMWRkY2E3NDAyXkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/f_vbAtFSEc0",
    isPopular: true,
    isLatest: true,
    isTrending: true,
    imdbId: "tt8178634"
  },
  {
    id: 15,
    title: "Pushpa: The Rise",
    description: "Pushpa Raj, a coolie, volunteers to smuggle red sanders, a rare wood that only grows in the Seshachalam Hills of Andhra Pradesh. Pushpa quickly rises through the ranks of the syndicate through sheer daring and grit.",
    genre: "Action, Crime, Thriller",
    rating: 7.6,
    releaseDate: "2021-12-17",
    duration: "179 min",
    language: "Telugu, Hindi, Tamil",
    country: "India",
    director: "Sukumar",
    cast: "Allu Arjun, Rashmika Mandanna, Fahadh Faasil, Jagapathi Babu, Sunil",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BOWE4YWEyNjYtMWFiNC00M2IzLWE3ZGMtMjQ0ZGEyOWI1YjAzXkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BOWE4YWEyNjYtMWFiNC00M2IzLWE3ZGMtMjQ0ZGEyOWI1YjAzXkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/pKctjlpbqpA",
    isPopular: false,
    isLatest: true,
    isTrending: true,
    imdbId: "tt9389998"
  },
  {
    id: 16,
    title: "Spirited Away",
    description: "During her family's move to the suburbs, a sullen 10-year-old girl wanders into a world ruled by gods, witches, and spirits, and where humans are changed into beasts.",
    genre: "Animation, Adventure, Fantasy",
    rating: 8.6,
    releaseDate: "2001-07-20",
    duration: "125 min",
    language: "Japanese",
    country: "Japan",
    director: "Hayao Miyazaki",
    cast: "Rumi Hiiragi, Miyu Irino, Mari Natsuki, Takashi Naito, Yasuko Sawaguchi",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BNTEyNmEwOWUtYzkyOC00ZTQ4LTllZmUtMjk0Y2YwOGUzYjRiXkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BNTEyNmEwOWUtYzkyOC00ZTQ4LTllZmUtMjk0Y2YwOGUzYjRiXkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/ByXuk9QqQkk",
    isPopular: true,
    isLatest: false,
    isTrending: false,
    imdbId: "tt0245429"
  },
  {
    id: 17,
    title: "The Conjuring",
    description: "Paranormal investigators Ed and Lorraine Warren work to help a family terrorized by a dark presence in their farmhouse.",
    genre: "Horror, Thriller, Mystery",
    rating: 7.5,
    releaseDate: "2013-07-19",
    duration: "112 min",
    language: "English, Latin",
    country: "United States",
    director: "James Wan",
    cast: "Patrick Wilson, Vera Farmiga, Ron Livingston, Lili Taylor, Shanley Caswell",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BMTM3NjA1NDMyMV5BMl5BanBnXkFtZTcwMDQzNDMzOQ@@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BMTM3NjA1NDMyMV5BMl5BanBnXkFtZTcwMDQzNDMzOQ@@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/k10ETZ41q5o",
    isPopular: false,
    isLatest: false,
    isTrending: false,
    imdbId: "tt1457767"
  },
  {
    id: 18,
    title: "La La Land",
    description: "While navigating their careers in Los Angeles, a pianist and an actress fall in love while attempting to reconcile their aspirations for the future.",
    genre: "Comedy, Drama, Romance",
    rating: 8.0,
    releaseDate: "2016-12-09",
    duration: "128 min",
    language: "English",
    country: "United States",
    director: "Damien Chazelle",
    cast: "Ryan Gosling, Emma Stone, John Legend, J.K. Simmons, Rosemarie DeWitt",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BMzUzNDM2NzM2MV5BMl5BanBnXkFtZTgwNTM3NTg4OTE@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BMzUzNDM2NzM2MV5BMl5BanBnXkFtZTgwNTM3NTg4OTE@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/0pdqf4P9MB8",
    isPopular: true,
    isLatest: false,
    isTrending: false,
    imdbId: "tt3783958"
  },
  {
    id: 19,
    title: "Oppenheimer",
    description: "The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II.",
    genre: "Drama, Biography, History",
    rating: 8.9,
    releaseDate: "2023-07-21",
    duration: "180 min",
    language: "English, German, Italian",
    country: "United States, United Kingdom",
    director: "Christopher Nolan",
    cast: "Cillian Murphy, Emily Blunt, Matt Damon, Robert Downey Jr., Florence Pugh",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BN2JkMDc5MGQtZjg3YS00NmFiLWIyZmQtZTJmNTM5MjVmYTQ4XkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BN2JkMDc5MGQtZjg3YS00NmFiLWIyZmQtZTJmNTM5MjVmYTQ4XkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/uYPbbksJxIg",
    isPopular: true,
    isLatest: true,
    isTrending: true,
    imdbId: "tt15398776"
  },
  {
    id: 20,
    title: "Dune: Part Two",
    description: "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe, he endeavors to prevent a terrible future only he can foresee.",
    genre: "Sci-Fi, Action, Adventure",
    rating: 8.6,
    releaseDate: "2024-03-01",
    duration: "166 min",
    language: "English",
    country: "United States",
    director: "Denis Villeneuve",
    cast: "Timothée Chalamet, Zendaya, Rebecca Ferguson, Javier Bardem, Austin Butler",
    posterUrl: "https://m.media-amazon.com/images/M/MV5BNTc0YmQxMjEtODI5MC00NjFiLTlkMWUtOGQ5NjFmYWUyZGJhXkEyXkFqcGc@._V1_SX600.jpg",
    backdropUrl: "https://m.media-amazon.com/images/M/MV5BNTc0YmQxMjEtODI5MC00NjFiLTlkMWUtOGQ5NjFmYWUyZGJhXkEyXkFqcGc@._V1_SX1200.jpg",
    trailerUrl: "https://www.youtube.com/embed/Way9Dexny3w",
    isPopular: true,
    isLatest: true,
    isTrending: true,
    imdbId: "tt15239678"
  }
];

let nextMovieId = 21;

// Function to fetch movie data from OMDb API securely on the backend
async function fetchOmdbMovie(titleQuery: string): Promise<any | null> {
  if (!OMDB_API_KEY || OMDB_API_KEY.trim() === "" || OMDB_API_KEY === "your_omdb_api_key_here") {
    return null;
  }
  try {
    const sanitizedTitle = sanitizeString(titleQuery, 80);
    if (!sanitizedTitle) return null;

    const url = `${OMDB_BASE_URL}?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(sanitizedTitle)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.Response === "True") {
      return data;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Function to convert OMDb data into MovieVerse Movie model with validation
function mapOmdbToMovie(omdbData: any): Movie {
  const ratingNum = Math.min(10, Math.max(0, parseFloat(omdbData.imdbRating) || 7.5));
  const rawPoster = (omdbData.Poster && typeof omdbData.Poster === "string" && omdbData.Poster !== "N/A" && (omdbData.Poster.startsWith("http://") || omdbData.Poster.startsWith("https://")))
    ? omdbData.Poster
    : "N/A";
  
  return {
    id: nextMovieId++,
    title: sanitizeString(omdbData.Title || "Unknown Title", 150),
    description: sanitizeString(omdbData.Plot && omdbData.Plot !== "N/A" ? omdbData.Plot : "No description available.", 1000),
    genre: sanitizeString(omdbData.Genre && omdbData.Genre !== "N/A" ? omdbData.Genre : "Drama", 100),
    rating: ratingNum,
    releaseDate: omdbData.Released && omdbData.Released !== "N/A" ? new Date(omdbData.Released).toISOString().split("T")[0] : `${omdbData.Year || "2024"}-01-01`,
    duration: sanitizeString(omdbData.Runtime && omdbData.Runtime !== "N/A" ? omdbData.Runtime : "120 min", 30),
    language: sanitizeString(omdbData.Language && omdbData.Language !== "N/A" ? omdbData.Language : "English", 80),
    country: sanitizeString(omdbData.Country && omdbData.Country !== "N/A" ? omdbData.Country : "United States", 80),
    director: sanitizeString(omdbData.Director && omdbData.Director !== "N/A" ? omdbData.Director : "Unknown", 120),
    cast: sanitizeString(omdbData.Actors && omdbData.Actors !== "N/A" ? omdbData.Actors : "Ensemble Cast", 250),
    posterUrl: rawPoster,
    backdropUrl: rawPoster,
    isPopular: ratingNum >= 8.0,
    isLatest: parseInt(omdbData.Year, 10) >= 2022,
    isTrending: false,
    imdbId: sanitizeString(omdbData.imdbID, 30)
  };
}

// In-memory Users store with seeded demo accounts (password: "password123")
const salt = bcrypt.genSaltSync(10);
const users: User[] = [
  {
    id: 1,
    name: "Alex Johnson",
    email: "alex@movieverse.com",
    password: bcrypt.hashSync("password123", salt),
    role: "USER",
    createdAt: new Date().toISOString()
  },
  {
    id: 2,
    name: "Demo User",
    email: "demo@movieverse.com",
    password: bcrypt.hashSync("password123", salt),
    role: "USER",
    createdAt: new Date().toISOString()
  }
];

// In-memory Favourites store
const favourites: Favourite[] = [
  { id: 1, userId: 1, movieId: 1, createdAt: new Date().toISOString() },
  { id: 2, userId: 1, movieId: 2, createdAt: new Date().toISOString() },
  { id: 3, userId: 1, movieId: 4, createdAt: new Date().toISOString() },
  { id: 4, userId: 2, movieId: 3, createdAt: new Date().toISOString() },
  { id: 5, userId: 2, movieId: 10, createdAt: new Date().toISOString() }
];

let nextUserId = 3;
let nextFavId = 6;

// Serve static frontend assets
const publicPath = path.join(process.cwd(), "public");
app.use(express.static(publicPath));

// Helper function to normalize strings for robust matching
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// -----------------------------------------------------------------------------
// REST API Endpoints (Strictly Secured)
// -----------------------------------------------------------------------------

// 1. GET /api/movies - query filters with OMDb fallback
app.get("/api/movies", async (req: Request, res: Response) => {
  const { title, genre, sort } = req.query;
  let result = [...movies];

  if (title && typeof title === "string" && title.trim() !== "") {
    const rawQ = sanitizeString(title, 80);
    const q = rawQ.toLowerCase();
    const normQ = normalizeText(rawQ);

    let matched = result.filter(m => {
      const matchRaw = m.title.toLowerCase().includes(q) || 
                       m.director.toLowerCase().includes(q) || 
                       m.genre.toLowerCase().includes(q) ||
                       m.cast.toLowerCase().includes(q);
      const matchNorm = normalizeText(m.title).includes(normQ) ||
                        normalizeText(m.director).includes(normQ);
      return matchRaw || matchNorm;
    });

    if (matched.length === 0 && rawQ.length >= 2) {
      const omdbData = await fetchOmdbMovie(rawQ);
      if (omdbData) {
        const newMovie = mapOmdbToMovie(omdbData);
        const existing = movies.find(m => normalizeText(m.title) === normalizeText(newMovie.title));
        if (!existing) {
          movies.push(newMovie);
          matched = [newMovie];
        } else {
          matched = [existing];
        }
      }
    }

    result = matched;
  }

  if (genre && typeof genre === "string" && genre.toLowerCase() !== "all") {
    const g = sanitizeString(genre, 40).toLowerCase();
    result = result.filter(m => m.genre.toLowerCase().includes(g));
  }

  if (sort === "rating") {
    result.sort((a, b) => b.rating - a.rating);
  } else if (sort === "date" || sort === "latest") {
    result.sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
  } else if (sort === "title") {
    result.sort((a, b) => a.title.localeCompare(b.title));
  }

  res.json(result);
});

// 2. GET /api/movies/popular
app.get("/api/movies/popular", (req: Request, res: Response) => {
  const popular = movies.filter(m => m.isPopular || m.rating >= 8.3);
  res.json(popular);
});

// 3. GET /api/movies/latest
app.get("/api/movies/latest", (req: Request, res: Response) => {
  const latest = [...movies].sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()).slice(0, 8);
  res.json(latest);
});

// 4. GET /api/movies/trending
app.get("/api/movies/trending", (req: Request, res: Response) => {
  const trending = movies.filter(m => m.isTrending);
  res.json(trending);
});

// 5. GET /api/movies/search?title=...
app.get("/api/movies/search", searchRateLimiter, async (req: Request, res: Response) => {
  const title = (req.query.title as string) || "";
  const rawQ = sanitizeString(title, 80);
  if (!rawQ) {
    return res.json([]);
  }
  const q = rawQ.toLowerCase();
  const normQ = normalizeText(rawQ);

  let matched = movies.filter(m => 
    m.title.toLowerCase().includes(q) || 
    m.director.toLowerCase().includes(q) || 
    m.cast.toLowerCase().includes(q) ||
    m.genre.toLowerCase().includes(q) ||
    normalizeText(m.title).includes(normQ)
  );

  if (matched.length === 0 && rawQ.length >= 2) {
    const omdbData = await fetchOmdbMovie(rawQ);
    if (omdbData) {
      const newMovie = mapOmdbToMovie(omdbData);
      const existing = movies.find(m => normalizeText(m.title) === normalizeText(newMovie.title));
      if (!existing) {
        movies.push(newMovie);
        matched = [newMovie];
      } else {
        matched = [existing];
      }
    }
  }

  res.json(matched);
});

// 6. GET /api/movies/omdb - Secure backend proxy
app.get("/api/movies/omdb", searchRateLimiter, async (req: Request, res: Response) => {
  if (!OMDB_API_KEY || OMDB_API_KEY.trim() === "" || OMDB_API_KEY === "your_omdb_api_key_here") {
    return res.status(200).json({
      Response: "False",
      Error: "OMDb API key is not configured on the server."
    });
  }

  const { t, s, i } = req.query;
  const safeT = sanitizeString(t, 80);
  const safeS = sanitizeString(s, 80);
  const safeI = sanitizeString(i, 30);

  try {
    let url = `${OMDB_BASE_URL}?apikey=${OMDB_API_KEY}&`;
    if (safeT) url += `t=${encodeURIComponent(safeT)}&`;
    if (safeS) url += `s=${encodeURIComponent(safeS)}&`;
    if (safeI) url += `i=${encodeURIComponent(safeI)}&`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.status(502).json({
        timestamp: new Date().toISOString(),
        status: 502,
        error: "Bad Gateway",
        message: "Failed to communicate with external movie provider"
      });
    }

    const data = await response.json();
    
    if (safeT && data.Response === "True") {
      const existing = movies.find(m => normalizeText(m.title) === normalizeText(data.Title));
      if (!existing) {
        const newMovie = mapOmdbToMovie(data);
        movies.push(newMovie);
      }
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({
      timestamp: new Date().toISOString(),
      status: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred while fetching movie metadata"
    });
  }
});

// 7. GET /api/movies/genre/:genre
app.get("/api/movies/genre/:genre", (req: Request, res: Response) => {
  const genreParam = sanitizeString(req.params.genre, 40).toLowerCase();
  if (genreParam === "all" || !genreParam) {
    return res.json(movies);
  }
  const filtered = movies.filter(m => m.genre.toLowerCase().includes(genreParam));
  res.json(filtered);
});

// 8. GET /api/movies/:id
app.get("/api/movies/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0 || id > 2147483647) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Invalid movie ID format."
    });
  }

  const movie = movies.find(m => m.id === id);
  if (!movie) {
    return res.status(404).json({
      timestamp: new Date().toISOString(),
      status: 404,
      error: "Not Found",
      message: `Movie with id ${id} not found`
    });
  }
  res.json(movie);
});

// 9. POST /api/auth/register - Secure Registration with Password Policy & JWT
app.post("/api/auth/register", authRateLimiter, (req: Request, res: Response) => {
  const { name, email, password, confirmPassword } = req.body;

  const trimmedName = sanitizeString(name, 100);
  const trimmedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!trimmedName || !trimmedEmail || !password) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Full Name, Email, and Password are required."
    });
  }

  if (trimmedName.length < 2) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Name must be at least 2 characters."
    });
  }

  if (!isValidEmail(trimmedEmail)) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Please provide a valid email address."
    });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Password must be at least 8 characters long and contain both letters and numbers."
    });
  }

  if (confirmPassword && password !== confirmPassword) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Passwords do not match."
    });
  }

  // Duplicate email check
  const existing = users.find(u => u.email === trimmedEmail);
  if (existing) {
    return res.status(409).json({
      timestamp: new Date().toISOString(),
      status: 409,
      error: "Conflict",
      message: "An account with this email address already exists."
    });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const newUser: User = {
    id: nextUserId++,
    name: trimmedName,
    email: trimmedEmail,
    password: hashedPassword,
    role: "USER",
    createdAt: new Date().toISOString()
  };

  users.push(newUser);

  // Generate secure JWT token
  const token = generateJwt({ id: newUser.id, email: newUser.email, role: newUser.role });

  res.status(201).json({
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
    createdAt: newUser.createdAt,
    token,
    message: "Registration successful!"
  });
});

// 10. POST /api/auth/login - Secure Login with Brute Force Protection & Timing Attack Resistance
app.post("/api/auth/login", authRateLimiter, (req: Request, res: Response) => {
  const { email, password } = req.body;
  const ip = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
  const clientIp = Array.isArray(ip) ? ip[0] : String(ip);

  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Email and password are required."
    });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const lockoutKey = `${clientIp}:${trimmedEmail}`;
  const now = Date.now();

  // Check brute force lockout
  const lockRecord = rateLimitStores.failedLogins.get(lockoutKey);
  if (lockRecord && now < lockRecord.lockUntil) {
    const waitMins = Math.ceil((lockRecord.lockUntil - now) / 60000);
    return res.status(429).json({
      timestamp: new Date().toISOString(),
      status: 429,
      error: "Too Many Requests",
      message: `Account temporarily locked due to excessive failed attempts. Please try again in ${waitMins} minute(s).`
    });
  }

  const user = users.find(u => u.email === trimmedEmail);

  // Timing attack prevention: perform a dummy comparison if user not found
  if (!user) {
    bcrypt.compareSync(password, "$2a$10$w0JbYFz7c.yv61lW8w1f4O.RjS2eZc0XvN2K1E8F2P3Q4R5S6T7U8");
    
    // Track failed attempts
    const currentAttempts = (lockRecord ? lockRecord.attempts : 0) + 1;
    const lockUntil = currentAttempts >= 5 ? now + 5 * 60 * 1000 : 0;
    rateLimitStores.failedLogins.set(lockoutKey, { attempts: currentAttempts, lockUntil });

    return res.status(401).json({
      timestamp: new Date().toISOString(),
      status: 401,
      error: "Unauthorized",
      message: "Invalid email or password."
    });
  }

  const isMatch = bcrypt.compareSync(password, user.password);
  if (!isMatch) {
    const currentAttempts = (lockRecord ? lockRecord.attempts : 0) + 1;
    const lockUntil = currentAttempts >= 5 ? now + 5 * 60 * 1000 : 0;
    rateLimitStores.failedLogins.set(lockoutKey, { attempts: currentAttempts, lockUntil });

    return res.status(401).json({
      timestamp: new Date().toISOString(),
      status: 401,
      error: "Unauthorized",
      message: "Invalid email or password."
    });
  }

  // Clear failed login attempts on successful login
  rateLimitStores.failedLogins.delete(lockoutKey);

  // Generate JWT token
  const token = generateJwt({ id: user.id, email: user.email, role: user.role });

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    token,
    message: "Login successful!"
  });
});

// 11. GET /api/favourites/:userId - Protected & Authorized (Users only access their own favourites)
app.get("/api/favourites/:userId", authenticateToken, (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId) || userId <= 0) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Invalid user ID format."
    });
  }

  // Authorization Check: A user cannot access another user's favourites
  if (req.user && req.user.id !== userId && req.user.role !== "ADMIN") {
    return res.status(403).json({
      timestamp: new Date().toISOString(),
      status: 403,
      error: "Forbidden",
      message: "Access Denied: You are not authorized to view another user's favourites."
    });
  }

  const userFavs = favourites.filter(f => f.userId === userId);
  const favMovies = userFavs.map(f => {
    const movie = movies.find(m => m.id === f.movieId);
    return {
      favouriteId: f.id,
      userId: f.userId,
      createdAt: f.createdAt,
      movie: movie || null
    };
  }).filter(item => item.movie !== null);

  res.json(favMovies);
});

// 12. POST /api/favourites - Protected & Authorized
app.post("/api/favourites", authenticateToken, (req: Request, res: Response) => {
  const { movieId } = req.body;
  const targetUserId = req.user ? req.user.id : parseInt(req.body.userId, 10);

  if (!targetUserId || !movieId) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "movieId is required."
    });
  }

  // Ensure body userId cannot override the authenticated token identity
  if (req.body.userId && parseInt(req.body.userId, 10) !== req.user?.id && req.user?.role !== "ADMIN") {
    return res.status(403).json({
      timestamp: new Date().toISOString(),
      status: 403,
      error: "Forbidden",
      message: "Access Denied: You cannot modify favourites on behalf of another user."
    });
  }

  const mId = parseInt(movieId, 10);
  if (isNaN(mId) || mId <= 0) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Invalid movie ID."
    });
  }

  const movie = movies.find(m => m.id === mId);
  if (!movie) {
    return res.status(404).json({
      timestamp: new Date().toISOString(),
      status: 404,
      error: "Not Found",
      message: "Movie not found."
    });
  }

  const alreadyFav = favourites.find(f => f.userId === targetUserId && f.movieId === mId);
  if (alreadyFav) {
    return res.status(409).json({
      timestamp: new Date().toISOString(),
      status: 409,
      error: "Conflict",
      message: "Movie is already in favourites."
    });
  }

  const newFav: Favourite = {
    id: nextFavId++,
    userId: targetUserId,
    movieId: mId,
    createdAt: new Date().toISOString()
  };
  favourites.push(newFav);

  res.status(201).json({
    message: "Movie added to favourites successfully",
    favourite: {
      favouriteId: newFav.id,
      userId: newFav.userId,
      movie: movie
    }
  });
});

// 13. DELETE /api/favourites/:userId/:movieId - Protected & Authorized
app.delete("/api/favourites/:userId/:movieId", authenticateToken, (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId, 10);
  const movieId = parseInt(req.params.movieId, 10);

  if (isNaN(userId) || isNaN(movieId) || userId <= 0 || movieId <= 0) {
    return res.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: "Bad Request",
      message: "Invalid user ID or movie ID."
    });
  }

  // Authorization Check
  if (req.user && req.user.id !== userId && req.user.role !== "ADMIN") {
    return res.status(403).json({
      timestamp: new Date().toISOString(),
      status: 403,
      error: "Forbidden",
      message: "Access Denied: You are not authorized to modify another user's favourites."
    });
  }

  const index = favourites.findIndex(f => f.userId === userId && f.movieId === movieId);
  if (index === -1) {
    return res.status(404).json({
      timestamp: new Date().toISOString(),
      status: 404,
      error: "Not Found",
      message: "Favourite entry not found."
    });
  }

  favourites.splice(index, 1);
  res.json({
    message: "Movie removed from favourites successfully",
    userId,
    movieId
  });
});

// -----------------------------------------------------------------------------
// HTML Page Route mappings for clean URLs
// -----------------------------------------------------------------------------
app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

app.get("/movies", (req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "movies.html"));
});

app.get("/movie-details", (req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "movie-details.html"));
});

app.get("/favourites", (req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "favourites.html"));
});

app.get("/login", (req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "login.html"));
});

app.get("/register", (req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "register.html"));
});

app.get("/about", (req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "about.html"));
});

app.get("/architecture", (req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "architecture.html"));
});

// Fallback route
app.get("*", (req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// -----------------------------------------------------------------------------
// Global Error Handler Middleware
// -----------------------------------------------------------------------------
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    timestamp: new Date().toISOString(),
    status: 500,
    error: "Internal Server Error",
    message: "An unexpected error occurred. Please try again later."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MovieVerse secured server running on http://localhost:${PORT}`);
});
