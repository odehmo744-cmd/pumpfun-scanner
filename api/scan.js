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

    // -----------------------------
    // 1. DEX Screener
    // -----------------------------

    const dexResponse = await fetch(
      "https://api.dexscreener.com/tokens/v1/solana/" +
      encodeURIComponent(token)
    );

    const pairs = dexResponse.ok
      ? await dexResponse.json()
      : [];

    const pair = pairs?.[0] || null;

    // -----------------------------
    // 2. Token supply
    // -----------------------------

    const supplyResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
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
      throw new Error(supplyData.error.message);
    }

    const supply = Number(
      supplyData.result?.value?.uiAmount || 0
    );

    // -----------------------------
    // 3. Largest token accounts
    // -----------------------------

    const largestResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "getTokenLargestAccounts",
        params: [
          token,
          {
            commitment: "confirmed"
          }
        ]
      })
    });

    const largestData = await largestResponse.json();

    if (largestData.error) {
      throw new Error(largestData.error.message);
    }

    const largestAccounts =
      largestData.result?.value || [];

    const addresses = largestAccounts.map(
      account => account.address
    );

    // -----------------------------
    // 4. Get actual owners
    // -----------------------------

    let ownerAccounts = [];

    if (addresses.length > 0) {
      const ownersResponse = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "getMultipleAccounts",
          params: [
            addresses,
            {
              encoding: "jsonParsed",
              commitment: "confirmed"
            }
          ]
        })
      });

      const ownersData = await ownersResponse.json();

      if (ownersData.error) {
        throw new Error(ownersData.error.message);
      }

      ownerAccounts =
        ownersData.result?.value || [];
    }

    // -----------------------------
    // 5. Map token accounts → owners
    // -----------------------------

    const holdersMap = new Map();

    largestAccounts.forEach((account, index) => {
      const accountInfo = ownerAccounts[index];

      const parsed =
        accountInfo?.data?.parsed?.info;

      const owner = parsed?.owner;

      const amount = Number(
        account.uiAmount || 0
      );

      if (!owner) return;

      if (!holdersMap.has(owner)) {
        holdersMap.set(owner, 0);
      }

      holdersMap.set(
        owner,
        holdersMap.get(owner) + amount
      );
    });

    // -----------------------------
    // 6. Convert to holder list
    // -----------------------------

    const holders = Array.from(
      holdersMap.entries()
    )
      .map(([address, amount]) => ({
        address,
        amount,
        percentage:
          supply > 0
            ? Number(
                ((amount / supply) * 100).toFixed(4)
              )
            : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    // -----------------------------
    // 7. Concentration
    // -----------------------------

    const top1Percentage =
      holders[0]?.percentage || 0;

    const top5Percentage =
      holders
        .slice(0, 5)
        .reduce(
          (sum, holder) =>
            sum + holder.percentage,
          0
        );

    const top10Percentage =
      holders
        .slice(0, 10)
        .reduce(
          (sum, holder) =>
            sum + holder.percentage,
          0
        );

    // -----------------------------
    // 8. Trading data
    // -----------------------------

    const buys1h =
      pair?.txns?.h1?.buys || 0;

    const sells1h =
      pair?.txns?.h1?.sells || 0;

    const totalTrades =
      buys1h + sells1h;

    const buyPressure =
      totalTrades > 0
        ? Number(
            ((buys1h / totalTrades) * 100)
              .toFixed(2)
          )
        : 0;

    // -----------------------------
    // 9. Final response
    // -----------------------------

    return res.status(200).json({
      success: true,

      token: {
        address: token,
        name: pair?.baseToken?.name || null,
        symbol: pair?.baseToken?.symbol || null
      },

      market: {
        priceUsd: pair?.priceUsd || null,
        marketCap:
          pair?.marketCap ||
          pair?.fdv ||
          null,
        liquidityUsd:
          pair?.liquidity?.usd ||
          null,
        volume24h:
          pair?.volume?.h24 ||
          0,
        priceChange24h:
          pair?.priceChange?.h24 ||
          0
      },

      trading: {
        buys1h,
        sells1h,
        buyPressure
      },

      holders: {
        supply,
        top1Percentage:
          Number(top1Percentage.toFixed(2)),
        top5Percentage:
          Number(top5Percentage.toFixed(2)),
        top10Percentage:
          Number(top10Percentage.toFixed(2)),
        uniqueOwners: holders.length,

        accounts: holders
          .slice(0, 20)
          .map((holder, index) => ({
            rank: index + 1,
            address: holder.address,
            amount: holder.amount,
            percentage: holder.percentage
          }))
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: String(error)
    });
  }
}
