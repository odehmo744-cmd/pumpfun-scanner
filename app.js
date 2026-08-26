async function login() {
  const password =
    document
      .getElementById("passwordInput")
      .value
      .trim();

  const loginResult =
    document.getElementById("loginResult");

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
    const response = await fetch(
      "/api/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          password
        })
      }
    );

    const data =
      await response.json();

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
        "Login failed"
      );
    }

    /*
      Simple login.
      No SCANNER_AUTH_SECRET.
      No cookies.
      No session expiration.
    */

    sessionStorage.setItem(
      "scannerAuthenticated",
      "true"
    );

    showScanner();

  } catch (error) {
    loginResult.innerHTML = `
      <div class="danger">
        ❌ ${error.message}
      </div>
    `;
  }
}


// =========================
// SHOW SCANNER
// =========================

function showScanner() {
  document.getElementById(
    "loginBox"
  ).style.display = "none";

  document.getElementById(
    "scannerBox"
  ).style.display = "block";
}


// =========================
// LOGIN CHECK
// =========================

function checkLogin() {
  const authenticated =
    sessionStorage.getItem(
      "scannerAuthenticated"
    );

  if (
    authenticated === "true"
  ) {
    showScanner();
  }
}


// =========================
// TOKEN EXTRACTION
// =========================

function extractTokenAddress(input) {
  input = input.trim();

  if (
    !input.includes("http")
  ) {
    return input;
  }

  const match =
    input.match(
      /pump\.fun\/(?:coin\/)?([^/?]+)/i
    );

  if (match) {
    return match[1];
  }

  return input;
}


// =========================
// SCAN
// =========================

async function scanToken() {
  const input =
    document
      .getElementById(
        "tokenInput"
      )
      .value
      .trim();

  const result =
    document.getElementById(
      "result"
    );

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

  const token =
    extractTokenAddress(input);

  result.innerHTML = `
    <div class="card">
      <div class="small">
        SCANNING...
      </div>

      <h2>
        🔎 Analyzing token
      </h2>

      <p>
        Please wait...
      </p>
    </div>
  `;

  try {
    const response =
      await fetch(
        "/api/scan?token=" +
        encodeURIComponent(token)
      );

    const data =
      await response.json();

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
        "Scanner error"
      );
    }

    displayScanResult(data);

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


// =========================
// DISPLAY RESULT
// =========================

function displayScanResult(data) {

  const result =
    document.getElementById(
      "result"
    );

  const market =
    data.market || {};

  const trading =
    data.trading || {};

  const holders =
    data.holders || {};

  const scanner =
    data.scanner || {};

  const token =
    data.token || {};

  const verdict =
    scanner.verdict ||
    "UNKNOWN";

  const score =
    scanner.score ?? 0;

  result.innerHTML = `

    <div class="card result">

      <div class="small">
        TOKEN
      </div>

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
        ${score}/100
      </p>

      <hr>

      <div class="small">
        MARKET
      </div>

      <p>
        <strong>Price:</strong>
        $${formatPrice(
          market.priceUsd
        )}
      </p>

      <p>
        <strong>Market Cap:</strong>
        $${formatNumber(
          market.marketCap
        )}
      </p>

      <p>
        <strong>Liquidity:</strong>
        $${formatNumber(
          market.liquidityUsd
        )}
      </p>

      <p>
        <strong>24H Volume:</strong>
        $${formatNumber(
          market.volume24h
        )}
      </p>

      <p>
        <strong>24H Change:</strong>
        ${market.priceChange24h || 0}%
      </p>

      <p class="small">
        Data: ${market.dataSource || "-"}
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
        <strong>Total Trades:</strong>
        ${trading.totalTrades || 0}
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
        Array.isArray(
          scanner.analysis
        )
          ? scanner.analysis
              .map(
                item =>
                  `<p>${item}</p>`
              )
              .join("")
          : "<p>No analysis available.</p>"
      }

      <hr>

      <div class="small">
        CONTRACT ADDRESS
      </div>

      <p
        style="
          word-break:break-all;
        "
      >
        ${token.address || "-"}
      </p>

    </div>
  `;
}


// =========================
// FORMAT NUMBER
// =========================

function formatNumber(value) {
  const number =
    Number(value || 0);

  return number.toLocaleString(
    "en-US",
    {
      maximumFractionDigits: 2
    }
  );
}


// =========================
// FORMAT PRICE
// =========================

function formatPrice(value) {
  const number =
    Number(value || 0);

  if (!number) {
    return "0";
  }

  if (number < 0.000001) {
    return number.toFixed(12);
  }

  if (number < 0.001) {
    return number.toFixed(9);
  }

  if (number < 1) {
    return number.toFixed(6);
  }

  return number.toFixed(4);
}


// =========================
// PAGE LOAD
// =========================

document.addEventListener(
  "DOMContentLoaded",
  checkLogin
);
