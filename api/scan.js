export default async function handler(req, res) {
  const scannedAt = Date.now();

  try {
    // =========================
    // NO CACHE
    // =========================

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    );

    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // =========================
    // TOKEN
    // =========================

    const token = String(
      req.query?.token || ""
    ).trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Missing token address"
      });
    }

    // =========================
    // HELIUS
    // =========================

    const heliusKey =
      process.env.HELIUS_API_KEY;

    if (!heliusKey) {
      return res.status(500).json({
        success: false,
        error:
          "HELIUS_API_KEY is not configured"
      });
    }

    const rpcUrl =
      "https://mainnet.helius-rpc.com/?api-key=" +
      encodeURIComponent(heliusKey);

    // =========================
    // HELIUS RPC HELPER
    // =========================

    async function helius(method, params, id) {
      const response = await fetch(
        rpcUrl,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control":
              "no-cache, no-store, max-age=0"
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            method,
            params
          })
        }
      );

      const data =
        await response.json();

      if (data.error) {
        throw new Error(
          data.error.message ||
          `Helius ${method} error`
        );
      }

      return data.result;
    }

    // ==================================================
    // DEXSCREENER
    // ==================================================

    const dexResponse = await fetch(
      "https://api.dexscreener.com/tokens/v1/solana/" +
        encodeURIComponent(token),
      {
        method: "GET",
        cache: "no-store",
        headers: {
          "Cache-Control":
            "no-cache, no-store, max-age=0"
        }
      }
    );

    const pairs =
      dexResponse.ok
        ? await dexResponse.json()
        : [];

    if (
      !Array.isArray(pairs) ||
      pairs.length === 0
    ) {
      return res.status(404).json({
        success: false,
        error:
          "No market data found for this token"
      });
    }

    // Best liquidity pair
    const pair =
      pairs
        .filter(
          p =>
            Number(
              p?.liquidity?.usd || 0
            ) > 0
        )
        .sort(
          (a, b) =>
            Number(
              b.liquidity.usd || 0
            ) -
            Number(
              a.liquidity.usd || 0
            )
        )[0] || pairs[0];

    // ==================================================
    // MARKET
    // ==================================================

    const liquidity =
      Number(
        pair?.liquidity?.usd || 0
      );

    const volume24h =
      Number(
        pair?.volume?.h24 || 0
      );

    const marketCap =
      Number(
        pair?.marketCap ??
        pair?.fdv ??
        0
      );

    const priceUsd =
      Number(
        pair?.priceUsd || 0
      );

    const priceChange24h =
      Number(
        pair?.priceChange?.h24 || 0
      );

    const volumeLiquidityRatio =
      liquidity > 0
        ? volume24h / liquidity
        : 0;

    // ==================================================
    // TRADING
    // ==================================================

    const buys1h =
      Number(
        pair?.txns?.h1?.buys || 0
      );

    const sells1h =
      Number(
        pair?.txns?.h1?.sells || 0
      );

    const totalTrades =
      buys1h + sells1h;

    const buyPressure =
      totalTrades > 0
        ? Number(
            (
              buys1h /
              totalTrades *
              100
            ).toFixed(2)
          )
        : 0;

    // ==================================================
    // SUPPLY
    // ==================================================

    const supplyResult =
      await helius(
        "getTokenSupply",
        [
          token,
          {
            commitment:
              "confirmed"
          }
        ],
        scannedAt + 1
      );

    const supply =
      Number(
        supplyResult?.value?.uiAmount || 0
      );

    // ==================================================
    // ALL TOKEN ACCOUNTS / HOLDERS
    //
    // Helius getTokenAccounts
    // ==================================================

    let allTokenAccounts = [];

    let page = 1;

    const MAX_HOLDER_PAGES = 10;

    while (
      page <= MAX_HOLDER_PAGES
    ) {
      const holderResult =
        await helius(
          "getTokenAccounts",
          {
            mint: token,
            page,
            limit: 1000,
            options: {
              showZeroBalance: false
            }
          },
          scannedAt + 10 + page
        );

      const accounts =
        holderResult?.token_accounts ||
        [];

      if (
        !Array.isArray(accounts) ||
        accounts.length === 0
      ) {
        break;
      }

      allTokenAccounts =
        allTokenAccounts.concat(
          accounts
        );

      if (
        accounts.length < 1000
      ) {
        break;
      }

      page++;
    }

    // ==================================================
    // AGGREGATE BY OWNER
    // ==================================================

    const ownerMap =
      new Map();

    for (
      const account of allTokenAccounts
    ) {
      const owner =
        account?.owner;

      const rawAmount =
        Number(
          account?.amount || 0
        );

      if (
        !owner ||
        !Number.isFinite(rawAmount) ||
        rawAmount <= 0
      ) {
        continue;
      }

      const previous =
        ownerMap.get(owner) || 0;

      ownerMap.set(
        owner,
        previous + rawAmount
      );
    }

    // ==================================================
    // DECIMALS
    // ==================================================

    let decimals = 0;

    try {
      const asset =
        await helius(
          "getAsset",
          {
            id: token,
            displayOptions: {
              showFungible: true
            }
          },
          scannedAt + 100
        );

      decimals =
        Number(
          asset?.content
            ?.metadata
            ?.decimals ??
          asset?.token_info
            ?.decimals ??
          0
        );
    } catch {
      decimals = 0;
    }

    // ==================================================
    // BUILD HOLDERS
    // ==================================================

    const multiplier =
      Math.pow(
        10,
        decimals
      );

    const holders =
      Array.from(
        ownerMap.entries()
      )
        .map(
          ([address, rawAmount]) => {

            const amount =
              decimals > 0
                ? rawAmount /
                  multiplier
                : rawAmount;

            const percentage =
              supply > 0
                ? (
                    amount /
                    supply *
                    100
                  )
                : 0;

            return {
              address,
              amount,
              percentage:
                Number(
                  percentage.toFixed(4)
                )
            };
          }
        )
        .filter(
          holder =>
            holder.amount > 0
        )
        .sort(
          (a, b) =>
            b.amount -
            a.amount
        );

    // ==================================================
    // HOLDER METRICS
    // ==================================================

    const top1Percentage =
      holders[0]?.percentage || 0;

    const top5Percentage =
      holders
        .slice(0, 5)
        .reduce(
          (sum, holder) =>
            sum +
            holder.percentage,
          0
        );

    const top10Percentage =
      holders
        .slice(0, 10)
        .reduce(
          (sum, holder) =>
            sum +
            holder.percentage,
          0
        );

    const top20Percentage =
      holders
        .slice(0, 20)
        .reduce(
          (sum, holder) =>
            sum +
            holder.percentage,
          0
        );

    const uniqueOwners =
      holders.length;

    // ==================================================
    // WHALE ANALYSIS
    // ==================================================

    const whale10 =
      holders.filter(
        h => h.percentage >= 10
      ).length;

    const whale5 =
      holders.filter(
        h => h.percentage >= 5
      ).length;

    // ==================================================
    // DISTRIBUTION SCORE
    // ==================================================

    let distributionScore = 0;

    if (top1Percentage <= 5) {
      distributionScore += 15;
    } else if (
      top1Percentage <= 10
    ) {
      distributionScore += 12;
    } else if (
      top1Percentage <= 20
    ) {
      distributionScore += 8;
    } else if (
      top1Percentage <= 30
    ) {
      distributionScore += 4;
    }

    if (top5Percentage <= 25) {
      distributionScore += 10;
    } else if (
      top5Percentage <= 40
    ) {
      distributionScore += 7;
    } else if (
      top5Percentage <= 55
    ) {
      distributionScore += 4;
    }

    // ==================================================
    // RED FLAGS
    // ==================================================

    const redFlags = [];

    if (liquidity < 10000) {
      redFlags.push(
        "Very low liquidity"
      );
    } else if (
      liquidity < 20000
    ) {
      redFlags.push(
        "Low liquidity"
      );
    }

    if (
      buyPressure < 40 &&
      totalTrades > 0
    ) {
      redFlags.push(
        "Heavy selling pressure"
      );
    }

    if (
      top1Percentage > 30
    ) {
      redFlags.push(
        "Top holder controls over 30%"
      );
    } else if (
      top1Percentage > 20
    ) {
      redFlags.push(
        "Top holder concentration is elevated"
      );
    }

    if (
      top5Percentage > 65
    ) {
      redFlags.push(
        "Top 5 holders control over 65%"
      );
    } else if (
      top5Percentage > 50
    ) {
      redFlags.push(
        "Top 5 holder concentration is high"
      );
    }

    if (
      volumeLiquidityRatio > 100
    ) {
      redFlags.push(
        "Extreme volume/liquidity ratio"
      );
    }

    if (
      priceChange24h > 1500
    ) {
      redFlags.push(
        "Extreme price increase"
      );
    }

    if (
      totalTrades < 50
    ) {
      redFlags.push(
        "Very low trading activity"
      );
    }

    // ==================================================
    // SCORE
    // ==================================================

    let score = 0;

    const analysis = [];

    // Liquidity: 20
    if (liquidity >= 100000) {
      score += 20;
      analysis.push(
        "Strong liquidity"
      );
    } else if (
      liquidity >= 50000
    ) {
      score += 16;
      analysis.push(
        "Good liquidity"
      );
    } else if (
      liquidity >= 20000
    ) {
      score += 12;
      analysis.push(
        "Acceptable liquidity"
      );
    } else if (
      liquidity >= 10000
    ) {
      score += 7;
      analysis.push(
        "Low liquidity"
      );
    } else {
      analysis.push(
        "⚠️ Very low liquidity"
      );
    }

    // Volume: 15
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
      analysis.push(
        "Strong volume"
      );
    } else if (
      volumeLiquidityRatio >= 2
    ) {
      score += 8;
      analysis.push(
        "Healthy volume"
      );
    } else if (
      volumeLiquidityRatio > 0
    ) {
      score += 4;
      analysis.push(
        "⚠️ Low volume"
      );
    }

    // Buy pressure: 15
    if (buyPressure >= 60) {
      score += 15;
      analysis.push(
        "Strong buying pressure"
      );
    } else if (
      buyPressure >= 55
    ) {
      score += 12;
      analysis.push(
        "Positive buying pressure"
      );
    } else if (
      buyPressure >= 48
    ) {
      score += 9;
      analysis.push(
        "Buy/sell pressure is balanced"
      );
    } else if (
      buyPressure >= 40
    ) {
      score += 5;
      analysis.push(
        "⚠️ Selling pressure is stronger"
      );
    } else {
      analysis.push(
        "🚨 Heavy selling pressure"
      );
    }

    // Momentum: 10
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

    // Holder concentration
    if (
      top1Percentage <= 10
    ) {
      score += 10;
      analysis.push(
        "Healthy top holder concentration"
      );
    } else if (
      top1Percentage <= 20
    ) {
      score += 8;
      analysis.push(
        "Moderate top holder concentration"
      );
    } else if (
      top1Percentage <= 30
    ) {
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
    if (
      top5Percentage <= 30
    ) {
      score += 10;
      analysis.push(
        "Healthy top 5 concentration"
      );
    } else if (
      top5Percentage <= 50
    ) {
      score += 7;
      analysis.push(
        "Moderate top 5 concentration"
      );
    } else if (
      top5Percentage <= 65
    ) {
      score += 3;
      analysis.push(
        "⚠️ High top 5 concentration"
      );
    } else {
      analysis.push(
        "🚨 Top 5 holders control a large supply"
      );
    }

    // Distribution
    if (
      uniqueOwners >= 1000
    ) {
      score += 10;
      analysis.push(
        "Excellent holder distribution"
      );
    } else if (
      uniqueOwners >= 500
    ) {
      score += 9;
      analysis.push(
        "Strong holder distribution"
      );
    } else if (
      uniqueOwners >= 100
    ) {
      score += 7;
      analysis.push(
        "Good holder distribution"
      );
    } else if (
      uniqueOwners >= 50
    ) {
      score += 5;
      analysis.push(
        "Limited holder distribution"
      );
    } else {
      score += 2;
      analysis.push(
        "⚠️ Very limited holder distribution"
      );
    }

    // Trading activity
    if (
      totalTrades >= 2000
    ) {
      score += 10;
      analysis.push(
        "Very active trading"
      );
    } else if (
      totalTrades >= 1000
    ) {
      score += 8;
      analysis.push(
        "Active trading"
      );
    } else if (
      totalTrades >= 300
    ) {
      score += 5;
      analysis.push(
        "Moderate trading activity"
      );
    } else if (
      totalTrades > 0
    ) {
      score += 2;
      analysis.push(
        "Low trading activity"
      );
    }

    // ==================================================
    // RED FLAG PENALTY
    // ==================================================

    score -=
      Math.min(
        redFlags.length * 3,
        15
      );

    score =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(score)
        )
      );

    // ==================================================
    // VERDICT
    // ==================================================

    let verdict;

    if (score >= 80) {
      verdict =
        "🟢 VERY STRONG";
    } else if (
      score >= 70
    ) {
      verdict =
        "🟢 STRONG WATCH";
    } else if (
      score >= 55
    ) {
      verdict =
        "🟡 WATCH";
    } else if (
      score >= 35
    ) {
      verdict =
        "🟠 HIGH RISK";
    } else {
      verdict =
        "🔴 AVOID";
    }

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(200).json({

      success: true,

      scannedAt,

      scannedAtISO:
        new Date(
          scannedAt
        ).toISOString(),

      token: {
        address: token,

        name:
          pair?.baseToken?.name ||
          null,

        symbol:
          pair?.baseToken?.symbol ||
          null
      },

      scanner: {
        score,
        verdict,
        analysis,
        redFlags
      },

      market: {
        priceUsd,
        marketCap,
        liquidityUsd:
          liquidity,
        volume24h,
        priceChange24h,

        volumeLiquidityRatio:
          Number(
            volumeLiquidityRatio.toFixed(2)
          ),

        dataSource:
          "DexScreener",

        pairAddress:
          pair?.pairAddress ||
          null,

        dexId:
          pair?.dexId ||
          null
      },

      trading: {
        buys1h,
        sells1h,
        totalTrades,
        buyPressure
      },

      holders: {
        supply,

        decimals,

        uniqueOwners,

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

        top20Percentage:
          Number(
            top20Percentage.toFixed(2)
          ),

        whale10,

        whale5,

        distributionScore,

        accounts:
          holders
            .slice(0, 20)
            .map(
              (
                holder,
                index
              ) => ({
                rank:
                  index + 1,

                address:
                  holder.address,

                amount:
                  holder.amount,

                percentage:
                  holder.percentage
              })
            )
      },

      // Important:
      // We do NOT falsely call the #1 holder
      // the developer.
      developer: {
        detected: false,
        status:
          "Developer identification requires transaction-history analysis."
      },

      firstBuyers: {
        detected: false,
        status:
          "First-buyer identification requires transaction-history analysis."
      },

      dataQuality: {
        holderAccountsFetched:
          allTokenAccounts.length,

        holderPagesFetched:
          page,

        holderDataSource:
          "Helius getTokenAccounts",

        marketDataSource:
          "DexScreener",

        freshScan:
          true
      }

    });

  } catch (error) {

    console.error(
      "SCAN ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      error:
        error?.message ||
        String(error),

      scannedAt:
        Date.now()
    });
  }
}
