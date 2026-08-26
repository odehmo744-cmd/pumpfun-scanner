export default async function handler(req, res) {
  try {
    const wallet = req.query?.wallet;
    const apiKey = process.env.HELIUS_API_KEY;

    if (!wallet) {
      return res.status(400).json({
        success: false,
        error: "Missing wallet address"
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "HELIUS_API_KEY is not configured"
      });
    }

    const rpcUrl =
      "https://mainnet.helius-rpc.com/?api-key=" +
      encodeURIComponent(apiKey);

    // Get SOL balance
    const balanceResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [wallet]
      })
    });

    const balanceData =
      await balanceResponse.json();

    if (balanceData.error) {
      return res.status(400).json({
        success: false,
        error: balanceData.error.message
      });
    }

    const solBalance =
      (balanceData.result?.value || 0) / 1e9;

    // Get recent signatures
    const historyResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "getSignaturesForAddress",
        params: [
          wallet,
          {
            limit: 100
          }
        ]
      })
    });

    const historyData =
      await historyResponse.json();

    const signatures =
      historyData.result || [];

    return res.status(200).json({
      success: true,

      wallet,

      solBalance,

      transactionCount:
        signatures.length,

      transactions:
        signatures.map(tx => ({
          signature: tx.signature,
          slot: tx.slot,
          blockTime: tx.blockTime,
          success: tx.err === null
        }))
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      error: String(error)
    });
  }
}
