const COOKIE_NAME = "scanner_auth";
const SESSION_TTL = 60 * 60 * 24; // 24 hours

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "Method not allowed"
      });
    }

    const password = req.body?.password;
    const correctPassword = process.env.SCANNER_PASSWORD;

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

    /*
      Simple private access cookie.

      HttpOnly:
      JavaScript cannot read the cookie.

      Secure:
      Cookie is sent only over HTTPS.

      SameSite=Strict:
      Helps prevent cross-site requests.

      Max-Age:
      Login remains valid for 24 hours.
    */

    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=authenticated; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`
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
