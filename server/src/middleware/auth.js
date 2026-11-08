import jwt from "jsonwebtoken";

export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const cookieHeader = req.headers.cookie || "";
  const sessionCookie = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith("ledgerlens_session="));
  const cookieToken = sessionCookie ? sessionCookie.slice("ledgerlens_session=".length) : null;
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = cookieToken || bearer;

  if (!token) return res.status(401).json({ message: "Access token required" });

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return res.status(503).json({ message: "Authentication is not configured" });
  jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"], issuer: "ledgerlens-pro", audience: "ledgerlens-client" }, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
}

export function enforceBrowserOrigin(allowedOrigins) {
  return (req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ message: "Request origin is not allowed" });
    next();
  };
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(err.message);
  res.status(status).json({ message: status >= 500 ? "Internal server error" : err.message });
}
