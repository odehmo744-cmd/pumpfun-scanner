import crypto from "crypto";

const COOKIE_NAME = "scanner_auth";
const SESSION_TTL = 60 * 60 * 24; // 24 hours

function getSecret() {
  return process.env.SCANNER_AUTH_SECRET;
}

function sign(value) {
  const secret = getSecret();

  if (!secret) {
    throw new Error("SCANNER_AUTH_SECRET is not configured");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex");
}

function createSession() {
  const expiresAt =
    Date.now() + SESSION_TTL * 1000;

  const randomPart =
    crypto.randomBytes(32).toString("hex");

  const payload =
    `${expiresAt}.${randomPart}`;

  const signature = sign(payload);

  return `${payload}.${signature}`;
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
        error:
          "SCANNER_PASSWORD is not configured"
      });
    }

    if (!getSecret()) {
      return res.status(500).json({
        success: false,
        error:
          "SCANNER_AUTH_SECRET is not configured"
      });
    }

    if (
      !password ||
      password !== correctPassword
    ) {
      return res.status(401).json({
        success: false,
        error: "Invalid password"
      });
    }

    const session = createSession();

    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=${encodeURIComponent(session)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`
    );

    return res.status(200).json({
      success: true
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: String(error)
    });
  }
}
