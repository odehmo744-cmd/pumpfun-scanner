function extractTokenAddress(input) {
  input = input.trim();

  if (!input.includes("http")) {
    return input;
  }

  const match = input.match(/pump\.fun\/(?:coin\/)?([^/?]+)/i);

  if (match) {
    return match[1];
  }

  return input;
}

function formatMoney(value) {
  const n = Number(value || 0);

  if (!Number.isFinite(n)) return "$0";

  if (n >= 1000000) {
    return "$" + (n / 1000000).toFixed(2) + "M";
  }

  if (n >= 1000) {
    return "$" + (n / 1000).toFixed(1) + "K";
  }

  return "$" + n.toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function calculateScore(market, trading, holders) {

  let score = 0;
  const reasons = [];

  const liquidity = Number(market.liquidityUsd || 0);
  const volume = Number(market.volume24h || 0);
  const buyPressure = Number(trading.buyPressure || 0);

  const top1 = Number(holders.top1Percentage || 0);
  const top5 = Number(holders.top5Percentage || 0);
  const owners = Number(holders.uniqueOwners || 0);

  // Liquidity
  if (liquidity >= 100000) {
    score += 20;
    reasons.push("Strong liquidity");
  } else if (liquidity >= 50000) {
    score += 12;
    reasons.push("Acceptable liquidity");
  } else if (liquidity >= 20000) {
    score += 5;
    reasons.push("Low/moderate liquidity");
  } else {
    reasons.push("⚠️ Very low liquidity");
  }

  // Volume
  if (volume >= 1000000) {
    score += 20;
    reasons.push("Very strong volume");
  } else if (volume >= 500000) {
    score += 15;
    reasons.push("Strong volume");
  } else if (volume >= 100000) {
    score += 8;
    reasons.push("Moderate volume");
  } else {
    reasons.push("⚠️ Low volume");
  }

  // Buy pressure
  if (buyPressure >= 60) {
    score += 20;
    reasons.push("Strong buying pressure");
  } else if (buyPressure >= 55) {
    score += 15;
    reasons.push("Positive buying pressure");
  } else if (buyPressure >= 50) {
    score += 8;
    reasons.push("Buy/sell pressure is balanced");
  } else {
    reasons.push("⚠️ Selling pressure is stronger");
  }

  // Top holder
  if (top1 < 15) {
    score += 15;
    reasons.push("Healthy top holder concentration");
  } else if (top1 < 30) {
    score += 8;
    reasons.push("Moderate top holder concentration");
  } else {
    reasons.push("🚨 Top holder concentration is very high");
  }

  // Top 5
  if (top5 < 40) {
    score += 15;
    reasons.push("Healthy top 5 concentration");
  } else if (top5 < 60) {
    score += 8;
    reasons.push("Moderate top 5 concentration");
  } else {
    reasons.push("🚨 Top 5 holders control a large supply");
  }

  // Number of holders
  if (owners >= 500) {
    score += 10;
    reasons.push("Large holder base");
  } else if (owners >= 100) {
    score += 6;
    reasons.push("Growing holder base");
  } else if (owners >= 50) {
    score += 3;
    reasons.push("Small holder base");
  } else {
    reasons.push("⚠️ Very few holders");
  }

  let verdict = "🔴 AVOID";

  if (score >= 75) {
    verdict = "🟢 STRONG";
  } else if (score >= 60) {
    verdict = "🟢 BUY / WATCH";
  } else if (score >= 45) {
    verdict = "🟡 WATCH";
  }

  return {
    score,
    verdict,
    reasons
  };
}

async function scanToken() {

  const input = document
    .getElementById("tokenInput")
    .value
    .trim();

  const result = document.getElementById("result");

  if (!input) {

    result.innerHTML = `
      <div class="card">
        <div class="danger">
          Please enter a Pump.fun link or Contract Address.
        </div>
      </div>
    `;

    return;
  }

  const token = extractTokenAddress(input);

  result.innerHTML = `
    <div class="card">
      <div class="small">SCANNING...</div>
      <h2>🔎 Analyzing token</h2>
      <p>Checking market, liquidity, volume and holders...</p>
    </div>
  `;

  try {

    const response = await fetch(
      `/api/scan?token=${encodeURIComponent(token)}`
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Scanner error"
      );
    }

    /*
      IMPORTANT:

      The API returns:

      data.token
      data.market
      data.trading
      data.holders

      NOT data.pairs
    */

    const tokenInfo = data.token || {};
    const market = data.market || {};
    const trading = data.trading || {};
    const holders = data.holders || {};

    if (
      !market.priceUsd &&
      !market.marketCap &&
      !market.liquidityUsd
    ) {
      throw new Error("No market data found.");
    }

    const analysis = calculateScore(
      market,
      trading,
      holders
    );

    result.innerHTML = `

      <div class="card result">

        <div class="small">
          TOKEN
        </div>

        <h2>
          ${tokenInfo.name || "Unknown"}
          (${tokenInfo.symbol || "-"})
        </h2>

        <hr>

        <div class="small">
          SCANNER RESULT
        </div>

        <h1>
          ${analysis.verdict}
        </h1>

        <p>
          <strong>Score:</strong>
          ${analysis.score}/100
        </p>

        <hr>

        <div class="small">
          MARKET
        </div>

        <p>
          <strong>Price:</strong>
          $${Number(
            market.priceUsd || 0
          ).toFixed(10)}
        </p>

        <p>
          <strong>Market Cap:</strong>
          ${formatMoney(market.marketCap)}
        </p>

        <p>
          <strong>Liquidity:</strong>
          ${formatMoney(market.liquidityUsd)}
        </p>

        <p>
          <strong>24H Volume:</strong>
          ${formatMoney(market.volume24h)}
        </p>

        <p>
          <strong>24H Change:</strong>
          ${Number(
            market.priceChange24h || 0
          ).toFixed(2)}%
        </p>

        <hr>

        <div class="small">
          TRADING
        </div>

        <p>
          <strong>1H Buys:</strong>
          ${trading.buys1h || 0}
        </p>

        <p>
          <strong>1H Sells:</strong>
          ${trading.sells1h || 0}
        </p>

        <p>
          <strong>Buy Pressure:</strong>
          ${Number(
            trading.buyPressure || 0
          ).toFixed(2)}%
        </p>

        <hr>

        <div class="small">
          HOLDERS
        </div>

        <p>
          <strong>Unique Holders:</strong>
          ${holders.uniqueOwners || 0}
        </p>

        <p>
          <strong>Top 1:</strong>
          ${Number(
            holders.top1Percentage || 0
          ).toFixed(2)}%
        </p>

        <p>
          <strong>Top 5:</strong>
          ${Number(
            holders.top5Percentage || 0
          ).toFixed(2)}%
        </p>

        <p>
          <strong>Top 10:</strong>
          ${Number(
            holders.top10Percentage || 0
          ).toFixed(2)}%
        </p>

        <hr>

        <div class="small">
          ANALYSIS
        </div>

        <ul>
          ${analysis.reasons
            .map(reason => `<li>${reason}</li>`)
            .join("")}
        </ul>

        <hr>

        <div class="small">
          CONTRACT ADDRESS
        </div>

        <p style="word-break:break-all;">
          ${tokenInfo.address || token}
        </p>

      </div>

    `;

  } catch (error) {

    result.innerHTML = `

      <div class="card">

        <div class="danger">
          ❌ ${error.message}
        </div>

      </div>

    `;

  }
}
