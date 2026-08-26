export default async function handler(req, res) {
  try {
    // ==================================================
    // NO CACHE
    // ==================================================

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    );

    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const scannedAt = Date.now();

    // ==================================================
    // TOKEN
    // ==================================================

    const token = String(req.query?.token || "").trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Missing token address"
      });
    }

    // Basic Solana address sanity check
    if (token.length < 32 || token.length > 50) {
      return res.status(400).json({
        success: false,
        error: "Invalid Solana token address"
      });
    }

    // ==================================================
    // HELIUS
    // ==================================================

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

    // ==================================================
    // RPC HELPER
    // ==================================================

    async function rpc(method, params, id) {
      const response = await fetch(rpcUrl, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, max-age=0"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          `RPC HTTP ${response.status}`
        );
      }

      if (data.error) {
        throw new Error(
          data.error.message ||
          `RPC error: ${method}`
        );
      }

      return data.result;
    }

    // ==================================================
    // DEXSCREENER
    // ==================================================

    const dexUrl =
      "https://api.dexscreener.com/tokens/v1/solana/" +
      encodeURIComponent(token);

    const dexResponse = await fetch(dexUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control":
          "no-cache, no-store, max-age=0"
      }
    });

    const pairs = dexResponse.ok
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

    // ==================================================
    // SELECT BEST PAIR
    // ==================================================

    const solanaPairs = pairs.filter(
      p =>
        String(p?.chainId || "").toLowerCase() ===
        "solana"
    );

    const validPairs =
      solanaPairs.length > 0
        ? solanaPairs
        : pairs;

    const pair =
      validPairs
        .filter(
          p =>
            Number(p?.liquidity?.usd || 0) > 0
        )
        .sort(
          (a, b) =>
            Number(b?.liquidity?.usd || 0) -
            Number(a?.liquidity?.usd || 0)
        )[0] ||
      validPairs[0];

    if (!pair) {
      return res.status(404).json({
        success: false,
        error:
          "No usable trading pair found"
      });
    }

    // ==================================================
    // TOKEN MARKET DATA
    // ==================================================

    const priceUsd =
      Number(pair?.priceUsd || 0);

    const liquidity =
      Number(pair?.liquidity?.usd || 0);

    const volume24h =
      Number(pair?.volume?.h24 || 0);

    const volume6h =
      Number(pair?.volume?.h6 || 0);

    const volume1h =
      Number(pair?.volume?.h1 || 0);

    const priceChange24h =
      Number(pair?.priceChange?.h24 || 0);

    const priceChange1h =
      Number(pair?.priceChange?.h1 || 0);

    const marketCap =
      Number(
        pair?.marketCap ??
        pair?.fdv ??
        0
      );

    const fdv =
      Number(pair?.fdv || 0);

    const volumeLiquidityRatio =
      liquidity > 0
        ? volume24h / liquidity
        : 0;

    // ==================================================
    // TRADING
    // ==================================================

    const buys1h =
      Number(pair?.txns?.h1?.buys || 0);

    const sells1h =
      Number(pair?.txns?.h1?.sells || 0);

    const buys5m =
      Number(pair?.txns?.m5?.buys || 0);

    const sells5m =
      Number(pair?.txns?.m5?.sells || 0);

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

    // ==================================================
    // PAIR AGE
    // ==================================================

    const pairCreatedAt =
      Number(pair?.pairCreatedAt || 0);

    const pairAgeMinutes =
      pairCreatedAt > 0
        ? Math.max(
            0,
            (scannedAt - pairCreatedAt) /
              60000
          )
        : null;

    const pairAgeHours =
      pairAgeMinutes !== null
        ? pairAgeMinutes / 60
        : null;

    // ==================================================
    // SUPPLY
    // ==================================================

    const supplyResult =
      await rpc(
        "getTokenSupply",
        [
          token,
          {
            commitment: "confirmed"
          }
        ],
        scannedAt + 1
      );

    const supply =
      Number(
        supplyResult?.value?.uiAmount || 0
      );

    const decimals =
      Number(
        supplyResult?.value?.decimals || 0
      );

    // ==================================================
    // TOKEN MINT ACCOUNT
    // ==================================================

    let mintAuthority = null;
    let freezeAuthority = null;

    try {
      const mintAccount =
        await rpc(
          "getAccountInfo",
          [
            token,
            {
              encoding: "jsonParsed",
              commitment: "confirmed"
            }
          ],
          scannedAt + 2
        );

      const parsed =
        mintAccount?.value
          ?.data
          ?.parsed
          ?.info;

      mintAuthority =
        parsed?.mintAuthority || null;

      freezeAuthority =
        parsed?.freezeAuthority || null;
    } catch {
      // Do not fail the entire scan
    }

    // ==================================================
    // LARGEST ACCOUNTS
    // ==================================================

    const largestResult =
      await rpc(
        "getTokenLargestAccounts",
        [
          token,
          {
            commitment: "confirmed"
          }
        ],
        scannedAt + 3
      );

    const largestAccounts =
      largestResult?.value || [];

    const addresses =
      largestAccounts.map(
        account => account.address
      );

    // ==================================================
    // OWNERS
    // ==================================================

    let ownerAccounts = [];

    if (addresses.length > 0) {
      ownerAccounts =
        await rpc(
          "getMultipleAccounts",
          [
            addresses,
            {
              encoding: "jsonParsed",
              commitment: "confirmed"
            }
          ],
          scannedAt + 4
        );
    }

    // ==================================================
    // HOLDER AGGREGATION
    // ==================================================

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
          Number(account?.uiAmount || 0);

        if (!owner || amount <= 0) {
          return;
        }

        holdersMap.set(
          owner,
          (
            holdersMap.get(owner) || 0
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

    // ==================================================
    // HOLDER CONCENTRATION
    // ==================================================

    const top1Percentage =
      holders[0]?.percentage || 0;

    const top3Percentage =
      holders
        .slice(0, 3)
        .reduce(
          (sum, holder) =>
            sum + holder.percentage,
          0
        );

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

    const uniqueOwners =
      holders.length;

    // ==================================================
    // RISK FLAGS
    // ==================================================

    const riskFlags = [];

    // Liquidity
    if (liquidity < 10000) {
      riskFlags.push(
        "🚨 Extremely low liquidity"
      );
    } else if (liquidity < 20000) {
      riskFlags.push(
        "⚠️ Low liquidity"
      );
    }

    // Volume
    if (
      liquidity > 0 &&
      volumeLiquidityRatio > 50
    ) {
      riskFlags.push(
        "🚨 Extreme volume/liquidity ratio"
      );
    } else if (
      liquidity > 0 &&
      volumeLiquidityRatio > 40
    ) {
      riskFlags.push(
        "⚠️ Very high volume/liquidity ratio"
      );
    }

    // Selling
    if (buyPressure < 40) {
      riskFlags.push(
        "🚨 Heavy selling pressure"
      );
    } else if (
      buyPressure < 48
    ) {
      riskFlags.push(
        "⚠️ Selling pressure is elevated"
      );
    }

    // Top holder
    if (top1Percentage > 30) {
      riskFlags.push(
        "🚨 Top holder concentration is very high"
      );
    } else if (
      top1Percentage > 20
    ) {
      riskFlags.push(
        "⚠️ Top holder concentration is elevated"
      );
    }

    // Top 5
    if (top5Percentage > 65) {
      riskFlags.push(
        "🚨 Top 5 holders control a large supply"
      );
    } else if (
      top5Percentage > 50
    ) {
      riskFlags.push(
        "⚠️ High top 5 concentration"
      );
    }

    // Mint authority
    if (mintAuthority) {
      riskFlags.push(
        "⚠️ Mint authority is still active"
      );
    }

    // Freeze authority
    if (freezeAuthority) {
      riskFlags.push(
        "⚠️ Freeze authority is still active"
      );
    }

    // Very new pair
    if (
      pairAgeMinutes !== null &&
      pairAgeMinutes < 10
    ) {
      riskFlags.push(
        "⚠️ Extremely new trading pair"
      );
    } else if (
      pairAgeHours !== null &&
      pairAgeHours < 1
    ) {
      riskFlags.push(
        "⚠️ Trading pair is less than 1 hour old"
      );
    }

    // Extreme momentum
    if (priceChange24h > 1500) {
      riskFlags.push(
        "🚨 Extreme 24H price increase"
      );
    } else if (
      priceChange24h > 500
    ) {
      riskFlags.push(
        "⚠️ Very large 24H price increase"
      );
    }

    // Very low activity
    if (
      totalTrades > 0 &&
      totalTrades < 50
    ) {
      riskFlags.push(
        "⚠️ Very low trading activity"
      );
    }

    // ==================================================
    // POSITIVE SIGNALS
    // ==================================================

    const positives = [];

    if (liquidity >= 100000) {
      positives.push(
        "Strong liquidity"
      );
    } else if (
      liquidity >= 50000
    ) {
      positives.push(
        "Good liquidity"
      );
    }

    if (
      volumeLiquidityRatio >= 2 &&
      volumeLiquidityRatio <= 40
    ) {
      positives.push(
        "Healthy volume/liquidity activity"
      );
    }

    if (buyPressure >= 60) {
      positives.push(
        "Strong buying pressure"
      );
    } else if (
      buyPressure >= 55
    ) {
      positives.push(
        "Positive buying pressure"
      );
    }

    if (top1Percentage <= 10) {
      positives.push(
        "Low top-holder concentration"
      );
    }

    if (top5Percentage <= 30) {
      positives.push(
        "Healthy top-5 concentration"
      );
    }

    if (
      uniqueOwners >= 100
    ) {
      positives.push(
        "Good holder distribution"
      );
    }

    if (
      totalTrades >= 2000
    ) {
      positives.push(
        "Very active trading"
      );
    }

    // ==================================================
    // SCORE
    // ==================================================

    let score = 0;

    // -------------------------
    // LIQUIDITY: 20
    // -------------------------

    if (liquidity >= 100000) {
      score += 20;
    } else if (
      liquidity >= 50000
    ) {
      score += 16;
    } else if (
      liquidity >= 20000
    ) {
      score += 12;
    } else if (
      liquidity >= 10000
    ) {
      score += 7;
    }

    // -------------------------
    // VOLUME: 15
    // -------------------------

    if (
      volumeLiquidityRatio >= 10 &&
      volumeLiquidityRatio <= 40
    ) {
      score += 15;
    } else if (
      volumeLiquidityRatio >= 5 &&
      volumeLiquidityRatio < 50
    ) {
      score += 12;
    } else if (
      volumeLiquidityRatio >= 2
    ) {
      score += 8;
    } else if (
      volumeLiquidityRatio > 0
    ) {
      score += 4;
    }

    // -------------------------
    // BUY PRESSURE: 15
    // -------------------------

    if (buyPressure >= 60) {
      score += 15;
    } else if (
      buyPressure >= 55
    ) {
      score += 12;
    } else if (
      buyPressure >= 48
    ) {
      score += 9;
    } else if (
      buyPressure >= 40
    ) {
      score += 5;
    }

    // -------------------------
    // MOMENTUM: 10
    // -------------------------

    if (
      priceChange24h >= 20 &&
      priceChange24h <= 500
    ) {
      score += 10;
    } else if (
      priceChange24h > 500 &&
      priceChange24h <= 1500
    ) {
      score += 7;
    } else if (
      priceChange24h > 1500
    ) {
      score += 3;
    } else if (
      priceChange24h >= 0
    ) {
      score += 6;
    } else if (
      priceChange24h >= -20
    ) {
      score += 3;
    }

    // -------------------------
    // TOP HOLDER: 10
    // -------------------------

    if (
      top1Percentage <= 10
    ) {
      score += 10;
    } else if (
      top1Percentage <= 20
    ) {
      score += 8;
    } else if (
      top1Percentage <= 30
    ) {
      score += 5;
    }

    // -------------------------
    // TOP 5: 10
    // -------------------------

    if (
      top5Percentage <= 30
    ) {
      score += 10;
    } else if (
      top5Percentage <= 50
    ) {
      score += 7;
    } else if (
      top5Percentage <= 65
    ) {
      score += 3;
    }

    // -------------------------
    // HOLDER DISTRIBUTION: 10
    // -------------------------

    if (
      uniqueOwners >= 100
    ) {
      score += 10;
    } else if (
      uniqueOwners >= 50
    ) {
      score += 8;
    } else if (
      uniqueOwners >= 20
    ) {
      score += 5;
    } else {
      score += 2;
    }

    // -------------------------
    // TRADING ACTIVITY: 10
    // -------------------------

    if (
      totalTrades >= 2000
    ) {
      score += 10;
    } else if (
      totalTrades >= 1000
    ) {
      score += 8;
    } else if (
      totalTrades >= 300
    ) {
      score += 5;
    } else if (
      totalTrades > 0
    ) {
      score += 2;
    }

    // ==================================================
    // PENALTIES
    // ==================================================

    let penalty = 0;

    if (liquidity < 10000) {
      penalty += 15;
    } else if (
      liquidity < 20000
    ) {
      penalty += 8;
    }

    if (top1Percentage > 30) {
      penalty += 12;
    } else if (
      top1Percentage > 20
    ) {
      penalty += 6;
    }

    if (top5Percentage > 65) {
      penalty += 12;
    } else if (
      top5Percentage > 50
    ) {
      penalty += 6;
    }

    if (buyPressure < 40) {
      penalty += 10;
    } else if (
      buyPressure < 48
    ) {
      penalty += 5;
    }

    if (mintAuthority) {
      penalty += 5;
    }

    if (freezeAuthority) {
      penalty += 5;
    }

    if (
      pairAgeMinutes !== null &&
      pairAgeMinutes < 10
    ) {
      penalty += 5;
    }

    if (
      volumeLiquidityRatio > 50
    ) {
      penalty += 7;
    }

    if (
      priceChange24h > 1500
    ) {
      penalty += 7;
    }

    score =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(
            score - penalty
          )
        )
      );

    // ==================================================
    // VERDICT
    // ==================================================

    let verdict;
    let verdictLevel;

    if (score >= 80) {
      verdict =
        "🟢 VERY STRONG";
      verdictLevel =
        "very_strong";
    } else if (
      score >= 70
    ) {
      verdict =
        "🟢 BUY / STRONG WATCH";
      verdictLevel =
        "strong";
    } else if (
      score >= 55
    ) {
      verdict =
        "🟡 WATCH";
      verdictLevel =
        "watch";
    } else if (
      score >= 35
    ) {
      verdict =
        "🟠 HIGH RISK";
      verdictLevel =
        "high_risk";
    } else {
      verdict =
        "🔴 AVOID";
      verdictLevel =
        "avoid";
    }

    // ==================================================
    // AUTOMATIC ANALYSIS
    // ==================================================

    const analysis = [
      ...positives,
      ...riskFlags
    ];

    if (
      analysis.length === 0
    ) {
      analysis.push(
        "No major signals detected"
      );
    }

    // ==================================================
    // DEV / FIRST BUYERS
    // ==================================================
    //
    // IMPORTANT:
    // We intentionally do NOT claim that the #1 holder
    // is the developer.
    //
    // The current RPC methods identify token accounts
    // and their owners, but they do not prove which
    // wallet created the token or which wallets were
    // the first buyers.
    //
    // So we return an explicit status instead of
    // inventing information.
    //

    const devAnalysis = {
      available: false,
      status:
        "Not verified",
      reason:
        "Developer wallet requires transaction-history analysis."
    };

    const firstBuyersAnalysis = {
      available: false,
      status:
        "Not verified",
      reason:
        "First buyers require transaction-history analysis."
    };

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

        verdictLevel,

        analysis,

        riskFlags,

        positives,

        penalty
      },

      market: {

        priceUsd,

        marketCap,

        fdv,

        liquidityUsd:
          liquidity,

        volume24h,

        volume6h,

        volume1h,

        priceChange24h,

        priceChange1h,

        volumeLiquidityRatio:
          Number(
            volumeLiquidityRatio.toFixed(2)
          ),

        pairAgeMinutes:
          pairAgeMinutes !== null
            ? Number(
                pairAgeMinutes.toFixed(2)
              )
            : null,

        pairAgeHours:
          pairAgeHours !== null
            ? Number(
                pairAgeHours.toFixed(2)
              )
            : null,

        pairCreatedAt,

        dataSource:
          "DexScreener",

        pairAddress:
          pair?.pairAddress ||
          null,

        dexId:
          pair?.dexId ||
          null,

        pairUrl:
          pair?.url ||
          null
      },

      trading: {

        buys1h,

        sells1h,

        buys5m,

        sells5m,

        totalTrades,

        totalTrades5m,

        buyPressure,

        buyPressure5m
      },

      security: {

        mintAuthority: {
          active:
            Boolean(mintAuthority),

          address:
            mintAuthority
        },

        freezeAuthority: {
          active:
            Boolean(freezeAuthority),

          address:
            freezeAuthority
        }
      },

      dev: devAnalysis,

      firstBuyers:
        firstBuyersAnalysis,

      holders: {

        supply,

        decimals,

        top1Percentage:
          Number(
            top1Percentage.toFixed(2)
          ),

        top3Percentage:
          Number(
            top3Percentage.toFixed(2)
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

        analyzedAccounts:
          largestAccounts.length,

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

    console.error(
      "Scanner error:",
      error
    );

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
