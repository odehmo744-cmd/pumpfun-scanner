// =====================================================
// LOGIN
// =====================================================

async function login() {
  const passwordInput =
    document.getElementById("passwordInput");

  const loginResult =
    document.getElementById("loginResult");

  const password =
    passwordInput.value.trim();

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
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Login failed"
      );
    }

    // IMPORTANT:
    // Authentication is stored in the HttpOnly cookie
    // created by /api/login.
    // We DO NOT store the password or authentication
    // state in localStorage/sessionStorage.

    passwordInput.value = "";

    document.getElementById("loginBox").style.display =
      "none";

    document.getElementById("scannerBox").style.display =
      "block";

    loginResult.innerHTML = "";

  } catch (error) {
    loginResult.innerHTML = `
      <div class="danger">
        ❌ ${escapeHtml(error.message)}
      </div>
    `;
  }
}


// =====================================================
// CHECK LOGIN
// =====================================================

async function checkLogin() {
  /*
    We cannot directly read the HttpOnly cookie from
    JavaScript — and that's intentional.

    Instead, we test the protected API.
  */

  try {
    const response = await fetch(
      "/api/scan?token=11111111111111111111111111111111",
      {
        method: "GET",
        credentials: "same-origin"
      }
    );

    /*
      401 = not authenticated.
      Any other response means the authentication
      cookie was accepted by the server.

      We don't actually need valid token data here.
    */

    if (response.status !== 401) {
      document.getElementById("loginBox").style.display =
        "none";

      document.getElementById("scannerBox").style.display =
        "block";
    } else {
      document.getElementById("loginBox").style.display =
        "block";

      document.getElementById("scannerBox").style.display =
        "none";
    }

  } catch (error) {
    // If the check fails, show login screen.
    document.getElementById("loginBox").style.display =
      "block";

    document.getElementById("scannerBox").style.display =
      "none";
  }
}


// =====================================================
// EXTRACT TOKEN ADDRESS
// =====================================================

function extractTokenAddress(input) {
  input = input.trim();

  if (!input) {
    return "";
  }

  /*
    If user pasted only the contract address
  */
  if (!input.includes("http")) {
    return input;
  }

  /*
    Supports:

    https://pump.fun/coin/ADDRESS
    https://pump.fun/ADDRESS
    https://www.pump.fun/coin/ADDRESS
  */

  const match = input.match(
    /pump\.fun\/(?:coin\/)?([^/?#]+)/i
  );

  if (match) {
    return match[1];
  }

  return input;
}


// =====================================================
// SCAN TOKEN
// =====================================================

async function scanToken() {

  const input =
    document
      .getElementById("tokenInput")
      .value
      .trim();

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

  const token =
    extractTokenAddress(input);

  if (!token) {
    result.innerHTML = `
      <div class="card">
        <div class="danger">
          Invalid token address.
        </div>
      </div>
    `;

    return;
  }

  result.innerHTML = `
    <div class="card">
      <div class="small">
        SCANNER
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

    /*
      credentials: "same-origin" is important.

      The browser automatically sends the HttpOnly
      scanner_auth cookie with this request.
    */

    const response =
      await fetch(
        `/api/scan?token=${encodeURIComponent(token)}`,
        {
          method: "GET",
          credentials: "same-origin"
        }
      );

    const data =
      await response.json();

    /*
      If authentication expired or the user doesn't
      have access anymore.
    */

    if (response.status === 401) {

      document.getElementById("loginBox").style.display =
        "block";

      document.getElementById("scannerBox").style.display =
        "none";

      result.innerHTML = "";

      alert(
        "Your session has expired. Please login again."
      );

      return;
    }

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Scanner error"
      );
    }

    displayScanResult(data);

  } catch (error) {

    result.innerHTML = `
      <div class="card">
        <div class="danger">
          ❌ ${escapeHtml(error.message)}
        </div>
      </div>
    `;
  }
}


// =====================================================
// DISPLAY SCANNER RESULT
// =====================================================

function displayScanResult(data) {

  const result =
    document.getElementById("result");

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
    scanner.verdict || "UNKNOWN";

  const score =
    scanner.score ?? 0;

  const analysis =
    Array.isArray(scanner.analysis)
      ? scanner.analysis
      : [];


  // ===================================================
  // ANALYSIS HTML
  // ===================================================

  const analysisHtml =
    analysis.length > 0

      ? analysis
          .map(
            item => `
              <p>
                ${escapeHtml(String(item))}
              </p>
            `
          )
          .join("")

      : `
          <p>
            No analysis available.
          </p>
        `;


  // ===================================================
  // RESULT
  // ===================================================

  result.innerHTML = `

    <div class="card result">

      <div class="small">
        TOKEN
      </div>

      <h2>
        ${escapeHtml(
          token.name || "Unknown"
        )}
        (${escapeHtml(
          token.symbol || "-"
        )})
      </h2>

      <hr>

      <div class="small">
        SCANNER RESULT
      </div>

      <h2>
        ${escapeHtml(verdict)}
      </h2>

      <p>
        <strong>Score:</strong>
        ${Number(score)}/100
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
        ${formatNumber(
          market.priceChange24h,
          2
        )}%
      </p>

      <p>
        <strong>Volume / Liquidity:</strong>
        ${formatNumber(
          market.volumeLiquidityRatio,
          2
        )}x
      </p>

      <hr>

      <div class="small">
        TRADING
      </div>

      <p>
        <strong>1H Buys:</strong>
        ${formatNumber(
          trading.buys1h,
          0
        )}
      </p>

      <p>
        <strong>1H Sells:</strong>
        ${formatNumber(
          trading.sells1h,
          0
        )}
      </p>

      <p>
        <strong>Total Trades:</strong>
        ${formatNumber(
          trading.totalTrades,
          0
        )}
      </p>

      <p>
        <strong>Buy Pressure:</strong>
        ${formatNumber(
          trading.buyPressure,
          2
        )}%
      </p>

      <hr>

      <div class="small">
        HOLDERS
      </div>

      <p>
        <strong>Unique Holders:</strong>
        ${formatNumber(
          holders.uniqueOwners,
          0
        )}
      </p>

      <p>
        <strong>Top 1:</strong>
        ${formatNumber(
          holders.top1Percentage,
          2
        )}%
      </p>

      <p>
        <strong>Top 5:</strong>
        ${formatNumber(
          holders.top5Percentage,
          2
        )}%
      </p>

      <p>
        <strong>Top 10:</strong>
        ${formatNumber(
          holders.top10Percentage,
          2
        )}%
      </p>

      <hr>

      <div class="small">
        ANALYSIS
      </div>

      ${analysisHtml}

      <hr>

      <div class="small">
        CONTRACT ADDRESS
      </div>

      <p style="word-break:break-all;">
        ${escapeHtml(
          token.address || "-"
        )}
      </p>

    </div>
  `;
}


// =====================================================
// FORMAT NUMBER
// =====================================================

function formatNumber(
  value,
  decimals = 0
) {

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toLocaleString(
    "en-US",
    {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }
  );
}


// =====================================================
// FORMAT PRICE
// =====================================================

function formatPrice(value) {

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number === 0
  ) {
    return "0.0000000000";
  }

  /*
    Keep very small token prices readable.
  */

  if (number < 0.000001) {
    return number.toFixed(12);
  }

  if (number < 0.001) {
    return number.toFixed(10);
  }

  if (number < 1) {
    return number.toFixed(8);
  }

  return number.toFixed(4);
}


// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHtml(value) {

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// =====================================================
// ENTER KEY
// =====================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    checkLogin();

    const passwordInput =
      document.getElementById(
        "passwordInput"
      );

    const tokenInput =
      document.getElementById(
        "tokenInput"
      );

    if (passwordInput) {

      passwordInput.addEventListener(
        "keydown",
        event => {

          if (event.key === "Enter") {
            login();
          }

        }
      );

    }

    if (tokenInput) {

      tokenInput.addEventListener(
        "keydown",
        event => {

          if (event.key === "Enter") {
            scanToken();
          }

        }
      );

    }

  }
);
