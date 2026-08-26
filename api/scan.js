export default async function handler(req, res) {
  try {
    // =========================================
    // NO CACHE
    // =========================================

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    );

    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const scannedAt = Date.now();

    // =========================================
    // TOKEN
    // =========================================

    const token = String(
      req.query?.token || ""
    ).trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Missing token address"
      });
    }

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

    // =========================================
    // HELPER: FETCH JSON
    // =========================================

    async function fetchJson(
      url,
      options = {}
    ) {
      const response = await fetch(
        url,
        {
          ...options,
          cache: "no-store",
          headers: {
            "Cache-Control":
              "no-cache, no-store, max-age=0",
            ...(options.headers || {})
          }
        }
      );

      const text =
        await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          "Invalid response from external API"
        );
      }

      return {
        ok: response.ok,
        data
      };
    }

    // =========================================
    // DEXSCREENER
    // =========================================

    const dexUrl =
      "https://api.dexscreener.com/tokens/v1/solana/" +
      encodeURIComponent(token);

    const dexResult =
      await fetchJson(dexUrl);

    const pairs =
      dexResult.ok &&
      Array.isArray(dexResult.data)
        ? dexResult.data
        : [];

    if (pairs.length === 0) {
      return res.status(404).json({
        success: false,
        error:
          "No market data found for this token"
      });
    }

    // =========================================
    // BEST PAIR
    // =========================================

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

    // =========================================
    // MARKET
    // =========================================

    const liquidity =
      Number(
        pair?.liquidity?.usd || 0
      );

    const volume24h =
      Number(
        pair?.volume?.h24 || 0
      );

    const volume6h =
      Number(
        pair?.volume?.h6 || 0
      );

    const volume1h =
      Number(
        pair?.volume?.h1 || 0
      );

    const volume5m =
      Number(
        pair?.volume?.m5 || 0
      );

    const priceUsd =
      Number(
        pair?.priceUsd || 0
      );

    const marketCap =
      Number(
        pair?.marketCap ??
        pair?.fdv ??
        0
      );

    const priceChange5m =
      Number(
        pair?.priceChange?.m5 || 0
      );

    const priceChange1h =
      Number(
        pair?.priceChange?.h1 || 0
      );

    const priceChange6h =
      Number(
        pair?.priceChange?.h6 || 0
      );

    const priceChange24h =
      Number(
        pair?.priceChange?.h24 || 0
      );

    const volumeLiquidityRatio =
      liquidity > 0
        ? volume24h / liquidity
        : 0;

    // =========================================
    // PAIR AGE
    // =========================================

    const pairCreatedAt =
      Number(
        pair?.pairCreatedAt || 0
      );

    let pairAgeMinutes = null;
    let pairAgeHours = null;

    if (pairCreatedAt > 0) {
      const ageMs =
        Math.max(
          0,
          scannedAt - pairCreatedAt
        );

      pairAgeMinutes =
        Number(
          (
            ageMs /
            60000
          ).toFixed(1)
        );

      pairAgeHours =
        Number(
          (
            ageMs /
            3600000
          ).toFixed(2)
        );
    }

    // =========================================
    // TRADING
    // =========================================

    const buys5m =
      Number(
        pair?.txns?.m5?.buys || 0
      );

    const sells5m =
      Number(
        pair?.txns?.m5?.sells || 0
      );

    const buys1h =
      Number(
        pair?.txns?.h1?.buys || 0
      );

    const sells1h =
      Number(
        pair?.txns?.h1?.sells || 0
      );

    const buys6h =
      Number(
        pair?.txns?.h6?.buys || 0
      );

    const sells6h =
      Number(
        pair?.txns?.h6?.sells || 0
      );

    const buys24h =
      Number(
        pair?.txns?.h24?.buys || 0
      );

    const sells24h =
      Number(
        pair?.txns?.h24?.sells || 0
      );

    const totalTrades =
      buys1h + sells1h;

    const totalTrades5m =
      buys5m + sells5m;

    const buyPressure =
      totalTrades > 0
        ? Number(
            (
              (buys1h /
                totalTrades) *
              100
            ).toFixed(2)
          )
        : 0;

    const buyPressure5m =
      totalTrades5m > 0
        ? Number(
            (
              (buys5m /
                totalTrades5m) *
              100
            ).toFixed(2)
          )
        : 0;

    // =========================================
    // SOLANA SUPPLY
    // =========================================

    async function rpcCall(
      method,
      params,
      id
    ) {
      const result =
        await fetchJson(
          rpcUrl,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id,
              method,
              params
            })
          }
        );

      if (
        result.data?.error
      ) {
        throw new Error(
          result.data.error.message ||
          `${method} failed`
        );
      }

      return result.data;
    }

    // =========================================
    // SUPPLY
    // =========================================

    const supplyData =
      await rpcCall(
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
        supplyData.result
          ?.value
          ?.uiAmount || 0
      );

    // =========================================
    // LARGEST ACCOUNTS
    // =========================================

    const largestData =
      await rpcCall(
        "getTokenLargestAccounts",
        [
          token,
          {
            commitment:
              "confirmed"
          }
        ],
        scannedAt + 2
      );

    const largestAccounts =
      largestData.result
        ?.value || [];

    const addresses =
      largestAccounts.map(
        account =>
          account.address
      );

    // =========================================
    // OWNERS
    // =========================================

    let ownerAccounts = [];

    if (
      addresses.length > 0
    ) {
      const ownersData =
        await rpcCall(
          "getMultipleAccounts",
          [
            addresses,
            {
              encoding:
                "jsonParsed",
              commitment:
                "confirmed"
            }
          ],
          scannedAt + 3
        );

      ownerAccounts =
        ownersData.result
          ?.value || [];
    }

    // =========================================
    // HOLDERS
    // =========================================

    const holdersMap =
      new Map();

    largestAccounts.forEach(
      (account, index) => {
        const accountInfo =
          ownerAccounts[index];

        const owner =
          accountInfo
            ?.data
            ?.parsed
            ?.info
            ?.owner;

        const amount =
          Number(
            account.uiAmount || 0
          );

        if (!owner) {
          return;
        }

        holdersMap.set(
          owner,
          (
            holdersMap.get(owner) ||
            0
          ) + amount
        );
      }
    );

    const holders =
      Array.from(
        holdersMap.entries()
      )
        .map(
          ([address, amount]) => ({
            address,
            amount,
            percentage:
              supply > 0
                ? Number(
                    (
                      (amount /
                        supply) *
                      100
                    ).toFixed(4)
                  )
                : 0
          })
        )
        .sort(
          (a, b) =>
            b.amount - a.amount
        );

    const top1Percentage =
      holders[0]
        ?.percentage || 0;

    const top5Percentage =
      holders
        .slice(0, 5)
        .reduce(
          (sum, h) =>
            sum + h.percentage,
          0
        );

    const top10Percentage =
      holders
        .slice(0, 10)
        .reduce(
          (sum, h) =>
            sum + h.percentage,
          0
        );

    // =========================================
    // RED FLAGS
    // =========================================

    const redFlags = [];

    // Liquidity
    if (
      liquidity < 10000
    ) {
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

    // Top holder
    if (
      top1Percentage > 30
    ) {
      redFlags.push(
        "Top holder concentration is extremely high"
      );
    } else if (
      top1Percentage > 20
    ) {
      redFlags.push(
        "Top holder concentration is elevated"
      );
    }

    // Top 5
    if (
      top5Percentage > 65
    ) {
      redFlags.push(
        "Top 5 holders control a very large supply"
      );
    } else if (
      top5Percentage > 50
    ) {
      redFlags.push(
        "Top 5 holder concentration is high"
      );
    }

    // Selling pressure
    if (
      buyPressure < 40 &&
      totalTrades > 0
    ) {
      redFlags.push(
        "Heavy selling pressure"
      );
    }

    // Short-term selling
    if (
      buyPressure5m < 35 &&
      totalTrades5m >= 10
    ) {
      redFlags.push(
        "Strong short-term selling pressure"
      );
    }

    // Extreme price move
    if (
      priceChange24h > 1500
    ) {
      redFlags.push(
        "Extreme 24H price increase"
      );
    }

    // Very high volume
    if (
      volumeLiquidityRatio > 50
    ) {
      redFlags.push(
        "Unusually high volume relative to liquidity"
      );
    }

    // Very new pair
    if (
      pairAgeMinutes !== null &&
      pairAgeMinutes < 10
    ) {
      redFlags.push(
        "Very new liquidity pair"
      );
    }

    // =========================================
    // SCORE
    // =========================================

    let score = 0;

    const analysis = [];

    // Liquidity: 20
    if (
      liquidity >= 100000
    ) {
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
    if (
      buyPressure >= 60
    ) {
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

    // Top holder: 10
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

    // Top 5: 10
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

    // Holder distribution: 10
    const uniqueOwners =
      holders.length;

    if (
      uniqueOwners >= 100
    ) {
      score += 10;
      analysis.push(
        "Strong holder distribution"
      );
    } else if (
      uniqueOwners >= 50
    ) {
      score += 8;
      analysis.push(
        "Good holder distribution"
      );
    } else if (
      uniqueOwners >= 20
    ) {
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

    // Trading activity: 10
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

    // =========================================
    // RED FLAG PENALTY
    // =========================================

    score -=
      Math.min(
        25,
        redFlags.length * 4
      );

    score =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(score)
        )
      );

    // =========================================
    // VERDICT
    // =========================================

    let verdict;

    if (
      score >= 75
    ) {
      verdict =
        "🟢 BUY / STRONG WATCH";
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

    // =========================================
    // RISK LEVEL
    // =========================================

    let riskLevel;

    if (
      score >= 75
    ) {
      riskLevel = "LOWER";
    } else if (
      score >= 55
    ) {
      riskLevel = "MEDIUM";
    } else if (
      score >= 35
    ) {
      riskLevel = "HIGH";
    } else {
      riskLevel = "EXTREME";
    }

    // =========================================
    // RESPONSE
    // =========================================

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
          pair?.baseToken
            ?.name || null,

        symbol:
          pair?.baseToken
            ?.symbol || null
      },

      scanner: {
        score,
        verdict,
        riskLevel,
        analysis,
        redFlags,
        redFlagCount:
          redFlags.length
      },

      market: {
        priceUsd,
        marketCap,
        liquidityUsd:
          liquidity,

        volume5m,
        volume1h,
        volume6h,
        volume24h,

        priceChange5m,
        priceChange1h,
        priceChange6h,
        priceChange24h,

        volumeLiquidityRatio:
          Number(
            volumeLiquidityRatio
              .toFixed(2)
          ),

        pairAgeMinutes,
        pairAgeHours,

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
        buys5m,
        sells5m,

        buys1h,
        sells1h,

        buys6h,
        sells6h,

        buys24h,
        sells24h,

        totalTrades,
        totalTrades5m,

        buyPressure,
        buyPressure5m
      },

      holders: {
        supply,

        top1Percentage:
          Number(
            top1Percentage
              .toFixed(2)
          ),

        top5Percentage:
          Number(
            top5Percentage
              .toFixed(2)
          ),

        top10Percentage:
          Number(
            top10Percentage
              .toFixed(2)
          ),

        uniqueOwners,

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
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,

      error:
        String(
          error?.message ||
          error
        ),

      scannedAt:
        Date.now()
    });
  }
}
