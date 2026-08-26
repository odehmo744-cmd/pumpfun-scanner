import crypto from "crypto";
const COOKIE_NAME = "scanner_auth";
const SESSION_TTL = 60 * 60 * 24; // 24 hours
// Simple in-memory sessions.
// Note: Vercel serverless instances can restart, so the user may
// occasionally need to log in again.
const sessions = globalThis.__scannerSessions || new Map();
globalThis.__scannerSessions = sessions;
function cleanupSessions() {
  const now = Date.now();
  for (const [session, expires] of sessions.entries()) {
    if (expires < now) {
      sessions.delete(session);
    }
  }
}
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "Method not allowed"
      });
    }
    const password = req.body?.password;
    const correctPassword =
      process.env.SCANNER_PASSWORD;
    if (!correctPassword) {
      return res.status(500).json({
        success: false,
        error: "SCANNER_PASSWORD is not configured"
      });
    }
    if (!password || password !== correctPassword) {
      return res.status(401).json({
        success: false,
        error: "Invalid password"
      });
    }
    cleanupSessions();
    const session =
      crypto.randomBytes(32).toString("hex");
    const expires =
      Date.now() + SESSION_TTL * 1000;
    sessions.set(session, expires);
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`
    );
    return res.status(200).json({
      success: true
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: String(error?.message || error)
    });
  }
}
