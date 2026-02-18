import rateLimit from "express-rate-limit";

export const rateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  max: Number(process.env.RATE_LIMIT_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false
});
