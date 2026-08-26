export default function handler(req, res) {
  const password = req.body?.password;

  const correctPassword = process.env.SCANNER_PASSWORD;

  if (!correctPassword) {
    return res.status(500).json({
      success: false,
      error: "SCANNER_PASSWORD is not configured"
    });
  }

  if (password !== correctPassword) {
    return res.status(401).json({
      success: false,
      error: "Invalid password"
    });
  }

  return res.status(200).json({
    success: true
  });
}
