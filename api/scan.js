import crypto from "crypto";

const COOKIE_NAME = "scanner_auth";


// =====================================================
// AUTH
// =====================================================

function getSecret() {
  return process.env.SCANNER_AUTH_SECRET;
}


function verifySession(req) {

  const secret = getSecret();

  if (!secret) {
    return false;
  }

  const cookieHeader =
    req.headers?.cookie || "";

  const cookies =
    cookieHeader
      .split(";")
      .map(cookie => cookie.trim());

  const authCookie =
    cookies.find(cookie =>
      cookie.startsWith(`${COOKIE_NAME}=`)
    );

  if (!authCookie) {
    return false;
  }

  try {

    const encodedValue =
      authCookie.substring(
        COOKIE_NAME.length + 1
      );

    const token =
      decodeURIComponent(encodedValue);

    const parts =
      token.split(".");

    if (parts.length !== 3) {
      return false;
    }

    const [
      expires,
      nonce,
      signature
    ] = parts;

    if (!/^\d+$/.test(expires)) {
      return false;
    }

    if (Number(expires) < Date.now()) {
      return false;
    }

    const payload =
      `${expires}.${nonce}`;

    const expected =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(payload)
        .digest("hex");

    if (
      signature.length !==
      expected.length
    ) {
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


// =====================================================
// SAFE NUMBER
// =====================================================

function number(value) {

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}


// =====================================================
// MAIN
// =====================================================

export default async function handler(req, res) {

  try {

    // ===================================================
    // AUTHENTICATION
    // ===================================================

    if (!getSecret()) {

      return res.status(500).json({
        success: false,
        error:
          "SCANNER_AUTH_SECRET is not configured"
      });

    }


    if (!verifySession(req)) {

      return res.status(401).json({
        success: false,
        error:
          "Authentication required"
      });

    }


    // ===================================================
    // TOKEN
    // ===================================================

    const token =
      String(
        req.query?.token || ""
      ).trim();


    if (!token) {

      return res.status(400).json({
        success: false,
        error:
          "Missing token address"
      });

    }


    // ===================================================
    // HELIUS
    // ===================================================

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


    // ===================================================
    // 1. PUMP.FUN DATA
    // ===================================================

    let pumpData = null;


    try {

      const pumpResponse =
        await fetch(
          "https://frontend-api-v3.pump.fun/coins-v2/" +
          encodeURIComponent(token)
        );


      if (pumpResponse.ok) {

        pumpData =
          await pumpResponse.json();

      }

    } catch {

      pumpData = null;

    }


    // ===================================================
    // FALLBACK PUMP.FUN ENDPOINT
    // ===================================================

    if (!pumpData) {

      try {

        const pumpResponse =
          await fetch(
            "https://frontend-api-v3.pump.fun/coins/" +
            encodeURIComponent(token) +
            "?sync=true"
          );


        if (pumpResponse.ok) {

          pumpData =
            await pumpResponse.json();

        }

      } catch {

        pumpData = null;

      }

    }


    // ===================================================
    // 2. DEX SCREENER
    // ===================================================

    let pairs = [];


    try {

      const dexResponse =
        await fetch(
          "https://api.dexscreener.com/tokens/v1/solana/" +
          encodeURIComponent(token)
        );


      if (dexResponse.ok) {

        const dexData =
          await dexResponse.json();

        if (Array.isArray(dexData)) {

          pairs = dexData;

        }

      }

    } catch {

      pairs = [];

    }


    // ===================================================
    // SELECT BEST DEX PAIR
    // ===================================================

    const pair =
      pairs
        .slice()
        .sort(
          (a, b) =>
            number(
              b?.liquidity?.usd
            ) -
            number(
              a?.liquidity?.usd
            )
        )[0] || null;


    // ===================================================
    // IMPORTANT:
    // MARKET CAP COMES FROM PUMP.FUN FIRST
    // ===================================================

    const pumpMarketCap =
      number(
        pumpData?.usd_market_cap
      );


    const dexMarketCap =
      number(
        pair?.marketCap
      );


    const marketCap =
      pumpMarketCap > 0
        ? pumpMarketCap
        : dexMarketCap;


    // ===================================================
    // PRICE
    // ===================================================

    let priceUsd =
      number(
        pumpData?.price_usd
      );


    if (!priceUsd) {

      priceUsd =
        number(
          pumpData?.priceUsd
        );

    }


    if (!priceUsd) {

      const pumpUsdMarketCap =
        number(
          pumpData?.usd_market_cap
        );

      const totalSupply =
        number(
          pumpData?.total_supply
        );


      if (
        pumpUsdMarketCap > 0 &&
        totalSupply > 0
      ) {

        priceUsd =
          pumpUsdMarketCap /
          totalSupply;

      }

    }


    if (!priceUsd) {

      priceUsd =
        number(
          pair?.priceUsd
        );

    }


    // ===================================================
    // 3. TOKEN SUPPLY
    // ===================================================

    const supplyResponse =
      await fetch(
        rpcUrl,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method:
                "getTokenSupply",

              params: [
                token,
                {
                  commitment:
                    "confirmed"
                }
              ]
            })
        }
      );


    const supplyData =
      await supplyResponse.json();


    if (supplyData.error) {

      throw new Error(
        supplyData.error.message
      );

    }


    const supply =
      number(
        supplyData
          .result
          ?.value
          ?.uiAmount
      );


    // ===================================================
    // 4. LARGEST TOKEN ACCOUNTS
    // ===================================================

    const largestResponse =
      await fetch(
        rpcUrl,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method:
                "getTokenLargestAccounts",

              params: [
                token,
                {
                  commitment:
                    "confirmed"
                }
              ]
            })
        }
      );


    const largestData =
      await largestResponse.json();


    if (largestData.error) {

      throw new Error(
        largestData.error.message
      );

    }


    const largestAccounts =
      largestData
        .result
        ?.value || [];


    const addresses =
      largestAccounts.map(
        account =>
          account.address
      );


    // ===================================================
    // 5. GET OWNERS
    // ===================================================

    let ownerAccounts = [];


    if (addresses.length > 0) {

      const ownersResponse =
        await fetch(
          rpcUrl,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                jsonrpc: "2.0",
                id: 3,
                method:
                  "getMultipleAccounts",

                params: [
                  addresses,
                  {
                    encoding:
                      "jsonParsed",

                    commitment:
                      "confirmed"
                  }
                ]
              })
          }
        );


      const ownersData =
        await ownersResponse.json();


      if (ownersData.error) {

        throw new Error(
          ownersData.error.message
        );

      }


      ownerAccounts =
        ownersData
          .result
          ?.value || [];

    }


    // ===================================================
    // 6. MAP TOKEN ACCOUNTS -> OWNERS
    // ===================================================

    const holdersMap =
      new Map();


    largestAccounts.forEach(
      (account, index) => {

        const accountInfo =
          ownerAccounts[index];


        const parsed =
          accountInfo
            ?.data
            ?.parsed
            ?.info;


        const owner =
          parsed?.owner;


        const amount =
          number(
            account.uiAmount
          );


        if (!owner) {
          return;
        }


        if (!holdersMap.has(owner)) {

          holdersMap.set(
            owner,
            0
          );

        }


        holdersMap.set(
          owner,
          holdersMap.get(owner) +
          amount
        );

      }
    );


    // ===================================================
    // 7. HOLDERS
    // ===================================================

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
                    amount /
                    supply *
                    100
                  ).toFixed(4)
                )
              : 0
        })
      )
      .sort(
        (a, b) =>
          b.amount -
          a.amount
      );


    // ===================================================
    // 8. HOLDER CONCENTRATION
    // ===================================================

    const top1Percentage =
      holders[0]?.percentage ||
      0;


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


    // ===================================================
    // 9. TRADING DATA
    // ===================================================

    const buys1h =
      number(
        pair?.txns?.h1?.buys
      );


    const sells1h =
      number(
        pair?.txns?.h1?.sells
      );


    const totalTrades =
      buys1h +
      sells1h;


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


    // ===================================================
    // 10. MARKET DATA
    // ===================================================

    const liquidity =
      number(
        pair?.liquidity?.usd
      );


    const volume24h =
      number(
        pair?.volume?.h24
      );


    const priceChange24h =
      number(
        pair?.priceChange?.h24
      );


    const volumeLiquidityRatio =
      liquidity > 0
        ? volume24h /
          liquidity
        : 0;


    // ===================================================
    // 11. SCORE
    // ===================================================

    let score = 0;

    const analysis = [];


    // LIQUIDITY
    if (liquidity >= 100000) {

      score += 20;
      analysis.push(
        "Strong liquidity"
      );

    } else if (liquidity >= 50000) {

      score += 16;
      analysis.push(
        "Good liquidity"
      );

    } else if (liquidity >= 20000) {

      score += 12;
      analysis.push(
        "Acceptable liquidity"
      );

    } else if (liquidity >= 10000) {

      score += 7;
      analysis.push(
        "Low liquidity"
      );

    } else {

      analysis.push(
        "⚠️ Very low liquidity"
      );

    }


    // VOLUME
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


    // BUY PRESSURE
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


    // PRICE MOMENTUM
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


    // TOP HOLDER
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


    // TOP 5
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


    // HOLDER COUNT
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


    // MARKET ACTIVITY
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


    // ===================================================
    // FINAL SCORE
    // ===================================================

    score =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(score)
        )
      );


    // ===================================================
    // VERDICT
    // ===================================================

    let verdict;


    if (score >= 75) {

      verdict =
        "🟢 BUY / STRONG WATCH";

    } else if (score >= 55) {

      verdict =
        "🟡 WATCH";

    } else if (score >= 35) {

      verdict =
        "🟠 HIGH RISK";

    } else {

      verdict =
        "🔴 AVOID";

    }


    // ===================================================
    // FINAL RESPONSE
    // ===================================================

    return res.status(200).json({

      success: true,


      token: {

        address: token,

        name:
          pumpData?.name ||
          pair?.baseToken?.name ||
          null,

        symbol:
          pumpData?.symbol ||
          pair?.baseToken?.symbol ||
          null
      },


      scanner: {

        score,

        verdict,

        analysis
      },


      market: {

        // Pump.fun price first
        priceUsd:
          priceUsd ||
          null,

        // Pump.fun USD market cap FIRST
        marketCap:
          marketCap ||
          null,

        // Useful for debugging/source tracking
        marketCapSource:
          pumpMarketCap > 0
            ? "pump.fun"
            : dexMarketCap > 0
              ? "dexscreener"
              : "unavailable",

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
        String(error?.message || error)

    });

  }

}
