import crypto from "crypto";
const COOKIE_NAME = "scanner_auth";
function getSecret() {
  return process.env.SCANNER_AUTH_SECRET;
}
function verifySession(req) {
  const secret = getSecret();
  if (!secret) {
    return false;
  }
  const cookieHeader = req.headers?.cookie || "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`)
  );
  if (!match) {
    return false;
  }
  try {
    const token = decodeURIComponent(match[1]);
    const parts = token.split(".");
    if (parts.length !== 3) {
      return false;
    }
    const [expires, nonce, signature] = parts;
    if (!/^\\d+$/.test(expires)) {
      return false;
    }
    if (Number(expires) < Date.now()) {
      return false;
    }
    const payload = `${expires}.${nonce}`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    if (signature.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
export default async function handler(req, res) {
  try {
    // =====================================================
    // AUTHENTICATION
    // =====================================================
    if (!getSecret()) {
      return res.status(500).json({
        success: false,
        error: "SCANNER_AUTH_SECRET is not configured"
      });
    }
    if (!verifySession(req)) {
      return res.status(401).json({
        success: false,
        error: "Authentication required"
      });
    }
    // =====================================================
    // TOKEN
    // =====================================================
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
    // =====================================================
    // 1. DEX SCREENER
    // =====================================================
    const dexResponse = await fetch(
      "https://api.dexscreener.com/tokens/v1/solana/" +
        encodeURIComponent(token)
    );
    const pairs = dexResponse.ok
      ? await dexResponse.json()
      : [];
    const pair = pairs?.[0] || null;
    // =====================================================
    // 2. TOKEN SUPPLY
    // =====================================================
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
    // =====================================================
    // 3. LARGEST TOKEN ACCOUNTS
    // =====================================================
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
    // =====================================================
    // 4. GET OWNERS
    // =====================================================
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
    // =====================================================
    // 5. MAP TOKEN ACCOUNTS -> OWNERS
    // =====================================================
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
    // =====================================================
    // 6. HOLDER LIST
    // =====================================================
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
    // =====================================================
    // 7. HOLDER CONCENTRATION
    // =====================================================
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
    // =====================================================
    // 8. TRADING DATA
    // =====================================================
    const buys1h =
      pair?.txns?.h1?.buys || 0;
    const sells1h =
      pair?.txns?.h1?.sells || 0;
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
    // =====================================================
    // 9. MARKET DATA
    // =====================================================
    const liquidity =
      Number(pair?.liquidity?.usd || 0);
    const volume24h =
      Number(pair?.volume?.h24 || 0);
    const marketCap =
      Number(
        pair?.marketCap ||
        pair?.fdv ||
        0
      );
    const priceChange24h =
      Number(
        pair?.priceChange?.h24 || 0
      );
    // =====================================================
    // 10. SCORE SYSTEM
    // =====================================================
    let score = 0;
    const analysis = [];
    // -----------------------------------------------------
    // LIQUIDITY — 20 POINTS
    // -----------------------------------------------------
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
      score += 0;
      analysis.push("⚠️ Very low liquidity");
    }
    // -----------------------------------------------------
    // VOLUME / LIQUIDITY — 15 POINTS
    // -----------------------------------------------------
    const volumeLiquidityRatio =
      liquidity > 0
        ? volume24h / liquidity
        : 0;
    if (
      volumeLiquidityRatio >= 10 &&
      volumeLiquidityRatio <= 40
    ) {
      score += 15;
      analysis.push("Very strong volume");
    } else if (
      volumeLiquidityRatio >= 5 &&
      volumeLiquidityRatio < 10
    ) {
      score += 12;
      analysis.push("Strong volume");
    } else if (
      volumeLiquidityRatio >= 2 &&
      volumeLiquidityRatio < 5
    ) {
      score += 8;
      analysis.push("Healthy volume");
    } else if (volumeLiquidityRatio > 0) {
      score += 4;
      analysis.push("⚠️ Low volume");
    }
    // -----------------------------------------------------
    // BUY PRESSURE — 15 POINTS
    // -----------------------------------------------------
    if (buyPressure >= 60) {
      score += 15;
      analysis.push("Strong buying pressure");
    } else if (buyPressure >= 55) {
      score += 12;
      analysis.push("Positive buying pressure");
    } else if (buyPressure >= 48) {
      score += 9;
      analysis.push("Buy/sell pressure is balanced");
    } else if (buyPressure >= 40) {
      score += 5;
      analysis.push("⚠️ Selling pressure is stronger");
    } else {
      score += 0;
      analysis.push("🚨 Heavy selling pressure");
    }
    // -----------------------------------------------------
    // PRICE MOMENTUM — 10 POINTS
    // -----------------------------------------------------
    if (
      priceChange24h >= 20 &&
      priceChange24h <= 500
    ) {
      score += 10;
      analysis.push("Strong positive momentum");
    } else if (
      priceChange24h > 500 &&
      priceChange24h <= 1500
    ) {
      score += 7;
      analysis.push("⚠️ Very high price increase");
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
      analysis.push("Positive price trend");
    } else if (
      priceChange24h >= -20
    ) {
      score += 3;
      analysis.push("Weak negative momentum");
    } else {
      score += 0;
      analysis.push("🚨 Strong negative momentum");
    }
    // -----------------------------------------------------
    // TOP HOLDER — 10 POINTS
    // -----------------------------------------------------
    if (top1Percentage <= 10) {
      score += 10;
      analysis.push("Healthy top holder concentration");
    } else if (top1Percentage <= 20) {
      score += 8;
      analysis.push("Moderate top holder concentration");
    } else if (top1Percentage <= 30) {
      score += 5;
      analysis.push("⚠️ Elevated top holder concentration");
    } else {
      score += 0;
      analysis.push(
        "🚨 Top holder concentration is very high"
      );
    }
    // -----------------------------------------------------
    // TOP 5 — 10 POINTS
    // -----------------------------------------------------
    if (top5Percentage <= 30) {
      score += 10;
      analysis.push("Healthy top 5 concentration");
    } else if (top5Percentage <= 50) {
      score += 7;
      analysis.push("Moderate top 5 concentration");
    } else if (top5Percentage <= 65) {
      score += 3;
      analysis.push("⚠️ High top 5 concentration");
    } else {
      score += 0;
      analysis.push(
        "🚨 Top 5 holders control a large supply"
      );
    }
    // -----------------------------------------------------
    // HOLDER COUNT — 10 POINTS
    // -----------------------------------------------------
    const uniqueOwners =
      holders.length;
    /*
      IMPORTANT:
      getTokenLargestAccounts returns only the
      largest token accounts, so this is NOT the
      total number of holders.
    */
    if (uniqueOwners >= 100) {
      score += 10;
      analysis.push("Strong holder distribution");
    } else if (uniqueOwners >= 50) {
      score += 8;
      analysis.push("Good holder distribution");
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
    // -----------------------------------------------------
    // MARKET ACTIVITY — 10 POINTS
    // -----------------------------------------------------
    if (totalTrades >= 2000) {
      score += 10;
      analysis.push("Very active trading");
    } else if (totalTrades >= 1000) {
      score += 8;
      analysis.push("Active trading");
    } else if (totalTrades >= 300) {
      score += 5;
      analysis.push("Moderate trading activity");
    } else if (totalTrades > 0) {
      score += 2;
      analysis.push("Low trading activity");
    }
    // =====================================================
    // FINAL SCORE LIMIT
    // =====================================================
    score = Math.max(
      0,
      Math.min(100, Math.round(score))
    );
    // =====================================================
    // VERDICT
    // =====================================================
    let verdict;
    if (score >= 75) {
      verdict = "🟢 BUY / STRONG WATCH";
    } else if (score >= 55) {
      verdict = "🟡 WATCH";
    } else if (score >= 35) {
      verdict = "🟠 HIGH RISK";
    } else {
      verdict = "🔴 AVOID";
    }
    // =====================================================
    // FINAL RESPONSE
    // =====================================================
    return res.status(200).json({
      success: true,
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
        analysis
      },
      market: {
        priceUsd:
          pair?.priceUsd ||
          null,
        marketCap:
          marketCap ||
          null,
        liquidityUsd:
          liquidity ||
          null,
        volume24h,
        priceChange24h,
        volumeLiquidityRatio:
          Number(
            volumeLiquidityRatio.toFixed(2)
          )
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
