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
