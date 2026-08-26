export default async function handler(req, res) {
  try {
    const token = req.query?.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Missing token address"
      });
    }

    const apiUrl =
      "https://api.dexscreener.com/tokens/v1/solana/" +
      encodeURIComponent(token);

    const response = await fetch(apiUrl);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: "DEX Screener returned HTTP " + response.status
      });
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      token: token,
      pairs: data
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: String(error)
    });
  }
}
