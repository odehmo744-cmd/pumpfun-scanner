export default async function handler(req, res) {
  try {
    const token = req.query?.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Missing token address"
      });
    }

    const heliusKey = process.env.HELIUS_API_KEY;

    if (!heliusKey) {
      return res.status(500).json({
        success: false,
        error: "HELIUS_API_KEY is not configured"
      });
    }

    const rpcUrl =
      "https://mainnet.helius-rpc.com/?api-key=" +
      encodeURIComponent(heliusKey);

    // Get the oldest transactions involving the token mint.
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransactionsForAddress",
        params: [
          token,
          {
            transactionDetails: "full",
            sortOrder: "asc",
            limit: 20,
            filters: {
              status: "succeeded"
            }
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(502).json({
        success: false,
        error:
          data.error?.message ||
          "Helius transaction request failed"
      });
    }

    const transactions = data.result?.data || [];

    const simplified = transactions.map((tx) => ({
      signature: tx.signature || null,
      slot: tx.slot || null,
      blockTime: tx.blockTime || null,
      feePayer: tx.feePayer || null,
      transactionError: tx.err || null
    }));

    return res.status(200).json({
      success: true,
      token,
      transactionCount: simplified.length,
      transactions: simplified
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: String(error)
    });
  }
}
