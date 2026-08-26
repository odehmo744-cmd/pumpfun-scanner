async function login() {
  const password = document
    .getElementById("passwordInput")
    .value
    .trim();

  const loginResult = document.getElementById("loginResult");

  if (!password) {
    loginResult.innerHTML = `
      <div class="danger">
        Please enter your password.
      </div>
    `;
    return;
  }

  loginResult.innerHTML = `
    <div class="small">
      Checking password...
    </div>
  `;

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Login failed");
    }

    // Save login session
    sessionStorage.setItem("scannerAuthenticated", "true");

    document.getElementById("loginBox").style.display = "none";
    document.getElementById("scannerBox").style.display = "block";

  } catch (error) {
    loginResult.innerHTML = `
      <div class="danger">
        ❌ ${error.message}
      </div>
    `;
  }
}


// Check if already logged in during this browser session
function checkLogin() {
  const authenticated =
    sessionStorage.getItem("scannerAuthenticated");

  if (authenticated === "true") {
    document.getElementById("loginBox").style.display = "none";
    document.getElementById("scannerBox").style.display = "block";
  }
}


// Extract token address
function extractTokenAddress(input) {
  input = input.trim();

  if (!input.includes("http")) {
    return input;
  }

  const match = input.match(
    /pump\.fun\/(?:coin\/)?([^/?]+)/i
  );

  if (match) {
    return match[1];
  }

  return input;
}


// Scan token
async function scanToken() {
  const input =
    document.getElementById("tokenInput").value.trim();

  const result =
    document.getElementById("result");

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
      <div class="small">Scanning...</div>
      <h2>🔎 Analyzing token</h2>
      <p>Please wait...</p>
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

    const pair = data;

    if (!pair) {
      throw new Error("No market data found.");
    }

    // Redirect the result to your existing scanner logic
    displayScanResult(pair);

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


// Display scanner result
function displayScanResult(data) {

  const result =
    document.getElementById("result");

  const market = data.market || {};
  const trading = data.trading || {};
  const holders = data.holders || {};
  const scanner = data.scanner || {};
  const token = data.token || {};

  const verdict =
    scanner.verdict || "UNKNOWN";

  result.innerHTML = `
    <div class="card result">

      <div class="small">TOKEN</div>

      <h2>
        ${token.name || "Unknown"}
        (${token.symbol || "-"})
      </h2>

      <hr>

      <div class="small">
        SCANNER RESULT
      </div>

      <h2>
        ${verdict}
      </h2>

      <p>
        <strong>Score:</strong>
        ${scanner.score ?? 0}/100
      </p>

      <hr>

      <div class="small">
        MARKET
      </div>

      <p>
        <strong>Price:</strong>
        $${Number(market.priceUsd || 0).toFixed(10)}
      </p>

      <p>
        <strong>Market Cap:</strong>
        $${Number(
          market.marketCap || 0
        ).toLocaleString()}
      </p>

      <p>
        <strong>Liquidity:</strong>
        $${Number(
          market.liquidityUsd || 0
        ).toLocaleString()}
      </p>

      <p>
        <strong>24H Volume:</strong>
        $${Number(
          market.volume24h || 0
        ).toLocaleString()}
      </p>

      <p>
        <strong>24H Change:</strong>
        ${market.priceChange24h || 0}%
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
        ${trading.buyPressure || 0}%
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
        ${holders.top1Percentage || 0}%
      </p>

      <p>
        <strong>Top 5:</strong>
        ${holders.top5Percentage || 0}%
      </p>

      <p>
        <strong>Top 10:</strong>
        ${holders.top10Percentage || 0}%
      </p>

      <hr>

      <div class="small">
        ANALYSIS
      </div>

      ${
        Array.isArray(scanner.analysis)
          ? scanner.analysis
              .map(item => `<p>${item}</p>`)
              .join("")
          : "<p>No analysis available.</p>"
      }

      <hr>

      <div class="small">
        CONTRACT ADDRESS
      </div>

      <p style="word-break:break-all;">
        ${token.address || "-"}
      </p>

    </div>
  `;
}


// Run login check when page loads
document.addEventListener(
  "DOMContentLoaded",
  checkLogin
);
