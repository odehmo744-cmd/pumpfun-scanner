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

    // 1. DEX Screener
    const dexResponse = await fetch(
      "https://api.dexscreener.com/tokens/v1/solana/" +
      encodeURIComponent(token)
    );

    if (!dexResponse.ok) {
      return res.status(dexResponse.status).json({
        success: false,
        error: "DEX Screener request failed"
      });
    }

    const pairs = await dexResponse.json();
    const pair = pairs?.[0] || null;

    // 2. Helius RPC
    const rpcUrl =
      "https://mainnet.helius-rpc.com/?api-key=" +
      encodeURIComponent(heliusKey);

    const rpcResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenLargestAccounts",
        params: [
          token,
          {
            commitment: "confirmed"
          }
        ]
      })
    });

    const rpcData = await rpcResponse.json();

    if (!rpcResponse.ok || rpcData.error) {
      return res.status(502).json({
        success: false,
        error:
          rpcData.error?.message ||
          "Helius RPC request failed"
      });
    }

    const holders = rpcData.result?.value || [];

    // 3. Token supply
    const supplyResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "getTokenSupply",
        params: [
          token,
          {
            commitment: "confirmed"
          }
        ]
      })
    });

    const supplyData = await supplyResponse.json();

    if (supplyData.error) {
      return res.status(502).json({
        success: false,
        error: supplyData.error.message
      });
    }

    const supply = Number(
      supplyData.result?.value?.uiAmount || 0
    );

    const topHolders = holders.map((holder, index) => {
      const amount = Number(holder.uiAmount || 0);

      return {
        rank: index + 1,
        address: holder.address,
        amount,
        percentage:
          supply > 0
            ? Number(((amount / supply) * 100).toFixed(2))
            : null
      };
    });

    const top10Percentage = topHolders
      .slice(0, 10)
      .reduce(
        (sum, holder) => sum + (holder.percentage || 0),
        0
      );

    return res.status(200).json({
      success: true,

      token: {
        address: token,
        name: pair?.baseToken?.name || null,
        symbol: pair?.baseToken?.symbol || null
      },

      market: {
        priceUsd: pair?.priceUsd || null,
        marketCap: pair?.marketCap || pair?.fdv || null,
        liquidityUsd: pair?.liquidity?.usd || null,
        volume24h: pair?.volume?.h24 || 0,
        priceChange24h: pair?.priceChange?.h24 || 0
      },

      trading: {
        buys1h: pair?.txns?.h1?.buys || 0,
        sells1h: pair?.txns?.h1?.sells || 0
      },

      holders: {
        supply,
        top10Percentage,
        accounts: topHolders
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: String(error)
    });
  }
}
