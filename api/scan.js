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

    // =========================
    // DEXSCREENER
    // =========================

    const dexResponse = await fetch(
      "https://api.dexscreener.com/tokens/v1/solana/" +
        encodeURIComponent(token)
    );

    const pairs = dexResponse.ok
      ? await dexResponse.json()
      : [];

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No market data found for this token"
      });
    }

    // Pick the pair with the highest liquidity
    const pair = pairs
      .filter(p => p?.liquidity?.usd)
      .sort(
        (a, b) =>
          Number(b.liquidity.usd) -
          Number(a.liquidity.usd)
      )[0] || pairs[0];

    // =========================
    // SUPPLY
    // =========================

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

    // =========================
    // LARGEST ACCOUNTS
    // =========================

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

    // =========================
    // OWNERS
    // =========================

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

      const ownersData =
        await ownersResponse.json();

      if (ownersData.error) {
        throw new Error(
          ownersData.error.message
        );
      }

      ownerAccounts =
        ownersData.result?.value || [];
    }

    // =========================
    // HOLDERS
    // =========================

    const holdersMap = new Map();

    largestAccounts.forEach(
      (account, index) => {
        const accountInfo =
          ownerAccounts[index];

        const owner =
          accountInfo?.data?.parsed?.info?.owner;

        const amount =
          Number(account.uiAmount || 0);

        if (!owner) return;

        holdersMap.set(
          owner,
          (holdersMap.get(owner) || 0) +
            amount
        );
      }
    );

    const holders = Array.from(
      holdersMap.entries()
    )
      .map(([address, amount]) => ({
        address,
        amount,
        percentage:
          supply > 0
            ? Number(
                (
                  (amount / supply) *
                  100
                ).toFixed(4)
              )
            : 0
      }))
      .sort(
        (a, b) => b.amount - a.amount
      );

    const top1Percentage =
      holders[0]?.percentage || 0;

    const top5Percentage =
      holders
        .slice(0, 5)
        .reduce(
          (sum, h) => sum + h.percentage,
          0
        );

    const top10Percentage =
      holders
        .slice(0, 10)
        .reduce(
          (sum, h) => sum + h.percentage,
          0
        );

    // =========================
    // TRADING
    // =========================

    const buys1h =
      Number(pair?.txns?.h1?.buys || 0);

    const sells1h =
      Number(pair?.txns?.h1?.sells || 0);

    const totalTrades =
      buys1h + sells1h;

    const buyPressure =
      totalTrades > 0
        ? Number(
            (
              (buys1h / totalTrades) *
              100
            ).toFixed(2)
          )
        : 0;

    // =========================
    // MARKET
    // =========================

    const liquidity =
      Number(pair?.liquidity?.usd || 0);

    const volume24h =
      Number(pair?.volume?.h24 || 0);

    /*
      IMPORTANT:
      DexScreener marketCap is preferred.
      FDV is only used as fallback.
    */

    const marketCap =
      Number(
        pair?.marketCap ??
        pair?.fdv ??
        0
      );

    const priceUsd =
      Number(pair?.priceUsd || 0);

    const priceChange24h =
      Number(
        pair?.priceChange?.h24 || 0
      );

    const volumeLiquidityRatio =
      liquidity > 0
        ? volume24h / liquidity
        : 0;

    // =========================
    // SCORE
    // =========================

    let score = 0;

    const analysis = [];

    // Liquidity
    if (liquidity >= 100000) {
      score += 20;
      analysis.push("Strong liquidity");
    } else if (liquidity >= 50000) {
      score += 16;
      analysis.push("Good liquidity");
    } else if (liquidity >= 20000) {
      score += 12;
      analysis.push("Acceptable liquidity");
    } else if (liquidity >= 10000) {
      score += 7;
      analysis.push("Low liquidity");
    } else {
      analysis.push(
        "⚠️ Very low liquidity"
      );
    }

    // Volume
    if (
      volumeLiquidityRatio >= 10 &&
      volumeLiquidityRatio <= 40
    ) {
      score += 15;
      analysis.push(
        "Very strong volume"
      );
    } else if (
      volumeLiquidityRatio >= 5
    ) {
      score += 12;
      analysis.push("Strong volume");
    } else if (
      volumeLiquidityRatio >= 2
    ) {
      score += 8;
      analysis.push("Healthy volume");
    } else if (
      volumeLiquidityRatio > 0
    ) {
      score += 4;
      analysis.push("⚠️ Low volume");
    }

    // Buy pressure
    if (buyPressure >= 60) {
      score += 15;
      analysis.push(
        "Strong buying pressure"
      );
    } else if (buyPressure >= 55) {
      score += 12;
      analysis.push(
        "Positive buying pressure"
      );
    } else if (buyPressure >= 48) {
      score += 9;
      analysis.push(
        "Buy/sell pressure is balanced"
      );
    } else if (buyPressure >= 40) {
      score += 5;
      analysis.push(
        "⚠️ Selling pressure is stronger"
      );
    } else {
      analysis.push(
        "🚨 Heavy selling pressure"
      );
    }

    // Momentum
    if (
      priceChange24h >= 20 &&
      priceChange24h <= 500
    ) {
      score += 10;
      analysis.push(
        "Strong positive momentum"
      );
    } else if (
      priceChange24h > 500 &&
      priceChange24h <= 1500
    ) {
      score += 7;
      analysis.push(
        "⚠️ Very high price increase"
      );
    } else if (
      priceChange24h > 1500
    ) {
      score += 3;
      analysis.push(
        "🚨 Extreme price increase / high risk"
      );
    } else if (
      priceChange24h >= 0
    ) {
      score += 6;
      analysis.push(
        "Positive price trend"
      );
    } else if (
      priceChange24h >= -20
    ) {
      score += 3;
      analysis.push(
        "Weak negative momentum"
      );
    } else {
      analysis.push(
        "🚨 Strong negative momentum"
      );
    }

    // Top holder
    if (top1Percentage <= 10) {
      score += 10;
      analysis.push(
        "Healthy top holder concentration"
      );
    } else if (top1Percentage <= 20) {
      score += 8;
      analysis.push(
        "Moderate top holder concentration"
      );
    } else if (top1Percentage <= 30) {
      score += 5;
      analysis.push(
        "⚠️ Elevated top holder concentration"
      );
    } else {
      analysis.push(
        "🚨 Top holder concentration is very high"
      );
    }

    // Top 5
    if (top5Percentage <= 30) {
      score += 10;
      analysis.push(
        "Healthy top 5 concentration"
      );
    } else if (top5Percentage <= 50) {
      score += 7;
      analysis.push(
        "Moderate top 5 concentration"
      );
    } else if (top5Percentage <= 65) {
      score += 3;
      analysis.push(
        "⚠️ High top 5 concentration"
      );
    } else {
      analysis.push(
        "🚨 Top 5 holders control a large supply"
      );
    }

    // Holder data
    const uniqueOwners =
      holders.length;

    if (uniqueOwners >= 100) {
      score += 10;
      analysis.push(
        "Strong holder distribution"
      );
    } else if (uniqueOwners >= 50) {
      score += 8;
      analysis.push(
        "Good holder distribution"
      );
    } else if (uniqueOwners >= 20) {
      score += 5;
      analysis.push(
        "Limited holder data"
      );
    } else {
      score += 2;
      analysis.push(
        "⚠️ Limited holder data"
      );
    }

    // Trading activity
    if (totalTrades >= 2000) {
      score += 10;
      analysis.push(
        "Very active trading"
      );
    } else if (totalTrades >= 1000) {
      score += 8;
      analysis.push(
        "Active trading"
      );
    } else if (totalTrades >= 300) {
      score += 5;
      analysis.push(
        "Moderate trading activity"
      );
    } else if (totalTrades > 0) {
      score += 2;
      analysis.push(
        "Low trading activity"
      );
    }

    score = Math.max(
      0,
      Math.min(100, Math.round(score))
    );

    let verdict;

    if (score >= 75) {
      verdict =
        "🟢 BUY / STRONG WATCH";
    } else if (score >= 55) {
      verdict = "🟡 WATCH";
    } else if (score >= 35) {
      verdict = "🟠 HIGH RISK";
    } else {
      verdict = "🔴 AVOID";
    }

    // =========================
    // RESPONSE
    // =========================

    return res.status(200).json({
      success: true,

      token: {
        address: token,
        name:
          pair?.baseToken?.name || null,
        symbol:
          pair?.baseToken?.symbol || null
      },

      scanner: {
        score,
        verdict,
        analysis
      },

      market: {
        priceUsd,
        marketCap,
        liquidityUsd: liquidity,
        volume24h,
        priceChange24h,
        volumeLiquidityRatio:
          Number(
            volumeLiquidityRatio.toFixed(2)
          ),

        // Extra information so we know
        // exactly where the data came from.
        dataSource: "DexScreener",
        pairAddress:
          pair?.pairAddress || null,
        dexId:
          pair?.dexId || null
      },

      trading: {
        buys1h,
        sells1h,
        totalTrades,
        buyPressure
      },

      holders: {
        supply,

        top1Percentage:
          Number(
            top1Percentage.toFixed(2)
          ),

        top5Percentage:
          Number(
            top5Percentage.toFixed(2)
          ),

        top10Percentage:
          Number(
            top10Percentage.toFixed(2)
          ),

        uniqueOwners,

        accounts:
          holders
            .slice(0, 20)
            .map(
              (holder, index) => ({
                rank: index + 1,
                address:
                  holder.address,
                amount:
                  holder.amount,
                percentage:
                  holder.percentage
              })
            )
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: String(error)
    });
  }
}
