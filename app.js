// =========================
// LOGIN
// =========================

async function login() {

  const passwordInput =
    document.getElementById(
      "passwordInput"
    );

  const loginResult =
    document.getElementById(
      "loginResult"
    );

  if (
    !passwordInput ||
    !loginResult
  ) {
    return;
  }

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

    const response =
      await fetch(
        "/api/login",
        {
          method: "POST",
          cache: "no-store",

          headers: {
            "Content-Type":
              "application/json",

            "Cache-Control":
              "no-cache"
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

    sessionStorage.setItem(
      "scannerAuthenticated",
      "true"
    );

    passwordInput.value = "";

    loginResult.innerHTML = "";

    showScanner();

  } catch (error) {

    loginResult.innerHTML = `
      <div class="danger">
        ❌ ${escapeHtml(
          error.message ||
          "Login failed"
        )}
      </div>
    `;
  }
}


// =========================
// SHOW SCANNER
// =========================

function showScanner() {

  const loginBox =
    document.getElementById(
      "loginBox"
    );

  const scannerBox =
    document.getElementById(
      "scannerBox"
    );

  if (loginBox) {
    loginBox.style.display =
      "none";
  }

  if (scannerBox) {
    scannerBox.style.display =
      "block";
  }
}


// =========================
// LOGIN CHECK
// =========================

function checkLogin() {

  if (
    sessionStorage.getItem(
      "scannerAuthenticated"
    ) === "true"
  ) {
    showScanner();
  }
}


// =========================
// TOKEN EXTRACTION
// =========================

function extractTokenAddress(
  input
) {

  input =
    String(
      input || ""
    ).trim();

  if (!input) {
    return "";
  }

  if (
    !input.includes("http://") &&
    !input.includes("https://")
  ) {
    return input;
  }

  const pumpMatch =
    input.match(
      /pump\.fun\/(?:coin\/)?([^/?#]+)/i
    );

  if (pumpMatch) {
    return pumpMatch[1];
  }

  try {

    const url =
      new URL(input);

    const parts =
      url.pathname
        .split("/")
        .filter(Boolean);

    if (
      parts.length > 0
    ) {
      return parts[
        parts.length - 1
      ];
    }

  } catch {}

  return input;
}


// =========================
// PASTE
// =========================

async function pasteToken() {

  const tokenInput =
    document.getElementById(
      "tokenInput"
    );

  if (!tokenInput) {
    return;
  }

  try {

    const text =
      await navigator.clipboard.readText();

    if (text) {

      tokenInput.value =
        text.trim();

      tokenInput.focus();

    }

  } catch {

    alert(
      "Unable to access clipboard. Please paste manually."
    );

    tokenInput.focus();
  }
}


// =========================
// CLEAR
// =========================

function clearScanner() {

  const tokenInput =
    document.getElementById(
      "tokenInput"
    );

  const result =
    document.getElementById(
      "result"
    );

  if (tokenInput) {
    tokenInput.value = "";
    tokenInput.focus();
  }

  if (result) {
    result.innerHTML = "";
  }
}


// =========================
// SCAN
// =========================

async function scanToken() {

  const tokenInput =
    document.getElementById(
      "tokenInput"
    );

  const result =
    document.getElementById(
      "result"
    );

  const scanButton =
    document.querySelector(
      ".scan-btn"
    );

  if (
    !tokenInput ||
    !result
  ) {
    return;
  }

  const input =
    tokenInput.value.trim();

  if (!input) {

    result.innerHTML = `
      <div class="card result">
        <div class="danger">
          Please enter a Pump.fun link
          or Contract Address.
        </div>
      </div>
    `;

    tokenInput.focus();

    return;
  }

  const token =
    extractTokenAddress(
      input
    );

  if (!token) {

    result.innerHTML = `
      <div class="card result">
        <div class="danger">
          Invalid token address.
        </div>
      </div>
    `;

    return;
  }

  if (scanButton) {

    scanButton.disabled = true;

    scanButton.innerHTML =
      "⏳ Scanning LIVE...";

  }

  result.innerHTML = `
    <div class="card result loading-card">

      <div class="small">
        LIVE SCAN
      </div>

      <h2>
        🔎 Analyzing Token
      </h2>

      <p>
        Fetching fresh market,
        trading and holder data...
      </p>

      <div class="scan-loader">
        <div></div>
      </div>

    </div>
  `;

  try {

    const cacheBuster =
      Date.now();

    const response =
      await fetch(
        "/api/scan?token=" +
          encodeURIComponent(
            token
          ) +
          "&_t=" +
          cacheBuster,
        {
          method: "GET",

          cache: "no-store",

          headers: {
            "Cache-Control":
              "no-cache, no-store, max-age=0",

            "Pragma":
              "no-cache",

            "Expires":
              "0"
          }
        }
      );

    let data;

    try {
      data =
        await response.json();
    } catch {
      throw new Error(
        "Invalid response from server"
      );
    }

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
      <div class="card result">

        <div class="danger">
          ❌ ${escapeHtml(
            error.message ||
            "Scanner error"
          )}
        </div>

      </div>
    `;

  } finally {

    if (scanButton) {

      scanButton.disabled =
        false;

      scanButton.innerHTML =
        "🔍 Scan Token";
    }
  }
}


// =========================
// DISPLAY RESULT
// =========================

function displayScanResult(
  data
) {

  const result =
    document.getElementById(
      "result"
    );

  if (!result) {
    return;
  }

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

  const developer =
    data.developer || {};

  const firstBuyers =
    data.firstBuyers || {};

  const quality =
    data.dataQuality || {};

  const score =
    Number(
      scanner.score || 0
    );

  const verdict =
    scanner.verdict ||
    "UNKNOWN";

  const scoreClass =
    getScoreClass(score);

  const updatedAt =
    data.scannedAt
      ? new Date(
          data.scannedAt
        ).toLocaleTimeString(
          "en-US",
          {
            hour:
              "2-digit",
            minute:
              "2-digit",
            second:
              "2-digit"
          }
        )
      : "NOW";

  result.innerHTML = `

    <!-- =========================
         TOKEN HEADER
    ========================== -->

    <div class="card result">

      <div class="small">
        TOKEN
      </div>

      <h2>
        ${escapeHtml(
          token.name ||
          "Unknown"
        )}
        <span class="token-symbol">
          (${escapeHtml(
            token.symbol ||
            "-"
          )})
        </span>
      </h2>

      <div class="live-badge">
        ● LIVE
      </div>

      <p class="small">
        🔄 Updated:
        ${escapeHtml(
          updatedAt
        )}
      </p>

      <p
        class="address"
        onclick="copyText('${escapeAttribute(
          token.address || ""
        )}')"
      >
        ${escapeHtml(
          token.address ||
          "-"
        )}
      </p>

    </div>


    <!-- =========================
         SCORE
    ========================== -->

    <div class="
      card
      result
      score-card
      ${scoreClass}
    ">

      <div class="small">
        FINAL SCANNER SCORE
      </div>

      <div class="score-number">
        ${score}
        <span>/100</span>
      </div>

      <div class="verdict">
        ${escapeHtml(
          verdict
        )}
      </div>

      <div class="score-bar">
        <div
          style="width:${score}%"
        ></div>
      </div>

    </div>


    <!-- =========================
         MARKET
    ========================== -->

    <div class="card result">

      <div class="section-title">
        📊 MARKET
      </div>

      <div class="metric-grid">

        ${metric(
          "Price",
          "$" +
            formatPrice(
              market.priceUsd
            )
        )}

        ${metric(
          "Market Cap",
          "$" +
            formatNumber(
              market.marketCap
            )
        )}

        ${metric(
          "Liquidity",
          "$" +
            formatNumber(
              market.liquidityUsd
            )
        )}

        ${metric(
          "24H Volume",
          "$" +
            formatNumber(
              market.volume24h
            )
        )}

        ${metric(
          "24H Change",
          formatPercent(
            market.priceChange24h
          )
        )}

        ${metric(
          "Vol/Liq",
          formatNumber(
            market.volumeLiquidityRatio
          ) +
            "x"
        )}

      </div>

      <p class="small">
        Data:
        ${escapeHtml(
          market.dataSource ||
          "-"
        )}
      </p>

    </div>


    <!-- =========================
         TRADING
    ========================== -->

    <div class="card result">

      <div class="section-title">
        ⚡ TRADING
      </div>

      <div class="metric-grid">

        ${metric(
          "1H Buys",
          formatInteger(
            trading.buys1h
          )
        )}

        ${metric(
          "1H Sells",
          formatInteger(
            trading.sells1h
          )
        )}

        ${metric(
          "Total Trades",
          formatInteger(
            trading.totalTrades
          )
        )}

        ${metric(
          "Buy Pressure",
          formatPercent(
            trading.buyPressure
          )
        )}

      </div>

      <div class="pressure-bar">

        <div
          style="
            width:${Math.max(
              0,
              Math.min(
                100,
                Number(
                  trading.buyPressure ||
                  0
                )
              )
            )}%
          "
        ></div>

      </div>

      <p class="small">
        Buy pressure is based on
        1-hour transaction count.
      </p>

    </div>


    <!-- =========================
         HOLDER DISTRIBUTION
    ========================== -->

    <div class="card result">

      <div class="section-title">
        🐋 HOLDER DISTRIBUTION
      </div>

      <div class="metric-grid">

        ${metric(
          "Holders",
          formatInteger(
            holders.uniqueOwners
          )
        )}

        ${metric(
          "Top 1",
          formatPercent(
            holders.top1Percentage
          )
        )}

        ${metric(
          "Top 5",
          formatPercent(
            holders.top5Percentage
          )
        )}

        ${metric(
          "Top 10",
          formatPercent(
            holders.top10Percentage
          )
        )}

        ${metric(
          "Top 20",
          formatPercent(
            holders.top20Percentage
          )
        )}

        ${metric(
          "≥5% Wallets",
          formatInteger(
            holders.whale5
          )
        )}

      </div>

    </div>


    <!-- =========================
         TOP WALLETS
    ========================== -->

    <div class="card result">

      <div class="section-title">
        👛 TOP WALLETS
      </div>

      ${
        renderWallets(
          holders.accounts
        )
      }

    </div>


    <!-- =========================
         RED FLAGS
    ========================== -->

    <div class="card result">

      <div class="section-title">
        🚨 RED FLAGS
      </div>

      ${
        renderRedFlags(
          scanner.redFlags
        )
      }

    </div>


    <!-- =========================
         ANALYSIS
    ========================== -->

    <div class="card result">

      <div class="section-title">
        🧠 ANALYSIS
      </div>

      ${
        renderAnalysis(
          scanner.analysis
        )
      }

    </div>


    <!-- =========================
         DEV
    ========================== -->

    <div class="card result">

      <div class="section-title">
        🧑‍💻 DEV / CREATOR
      </div>

      <div class="info-box">
        ⚠️ ${escapeHtml(
          developer.status ||
          "Not detected"
        )}
      </div>

      <p class="small">
        We intentionally do not label a
        top holder as the developer without
        transaction-history evidence.
      </p>

    </div>


    <!-- =========================
         FIRST BUYERS
    ========================== -->

    <div class="card result">

      <div class="section-title">
        🚀 FIRST BUYERS
      </div>

      <div class="info-box">
        ⚠️ ${escapeHtml(
          firstBuyers.status ||
          "Not detected"
        )}
      </div>

    </div>


    <!-- =========================
         DATA QUALITY
    ========================== -->

    <div class="card result">

      <div class="section-title">
        🛰️ DATA STATUS
      </div>

      ${metric(
        "Holder Accounts Scanned",
        formatInteger(
          quality.holderAccountsFetched
        )
      )}

      ${metric(
        "Source",
        quality.holderDataSource ||
          "-"
      )}

      <div class="success">
        ✓ Fresh scan completed
      </div>

    </div>


    <!-- =========================
         CONTRACT
    ========================== -->

    <div class="card result">

      <div class="section-title">
        📋 CONTRACT ADDRESS
      </div>

      <p
        class="address large-address"
        onclick="copyText('${escapeAttribute(
          token.address || ""
        )}')"
      >
        ${escapeHtml(
          token.address ||
          "-"
        )}
      </p>

      <button
        class="copy-btn"
        onclick="copyText('${escapeAttribute(
          token.address || ""
        )}')"
      >
        📋 Copy Contract
      </button>

    </div>

  `;
}


// =========================
// METRIC
// =========================

function metric(
  label,
  value
) {

  return `
    <div class="metric">

      <div class="metric-label">
        ${escapeHtml(
          label
        )}
      </div>

      <div class="metric-value">
        ${escapeHtml(
          value
        )}
      </div>

    </div>
  `;
}


// =========================
// SCORE CLASS
// =========================

function getScoreClass(
  score
) {

  if (score >= 70) {
    return "score-good";
  }

  if (score >= 55) {
    return "score-watch";
  }

  if (score >= 35) {
    return "score-risk";
  }

  return "score-danger";
}


// =========================
// WALLET RENDER
// =========================

function renderWallets(
  accounts
) {

  if (
    !Array.isArray(accounts) ||
    accounts.length === 0
  ) {

    return `
      <div class="info-box">
        No holder data available.
      </div>
    `;
  }

  return accounts
    .slice(0, 10)
    .map(
      holder => `
        <div class="wallet-row">

          <div class="wallet-rank">
            #${holder.rank}
          </div>

          <div class="wallet-address">
            ${shortAddress(
              holder.address
            )}
          </div>

          <div class="wallet-percent">
            ${formatPercent(
              holder.percentage
            )}
          </div>

        </div>
      `
    )
    .join("");
}


// =========================
// RED FLAGS
// =========================

function renderRedFlags(
  flags
) {

  if (
    !Array.isArray(flags) ||
    flags.length === 0
  ) {

    return `
      <div class="success">
        ✓ No major red flags detected
        from the current data.
      </div>
    `;
  }

  return flags
    .map(
      flag => `
        <div class="flag">
          🚨 ${escapeHtml(
            flag
          )}
        </div>
      `
    )
    .join("");
}


// =========================
// ANALYSIS
// =========================

function renderAnalysis(
  analysis
) {

  if (
    !Array.isArray(analysis) ||
    analysis.length === 0
  ) {

    return `
      <div class="info-box">
        No analysis available.
      </div>
    `;
  }

  return analysis
    .map(
      item => `
        <div class="analysis-item">
          ${escapeHtml(
            item
          )}
        </div>
      `
    )
    .join("");
}


// =========================
// SHORT ADDRESS
// =========================

function shortAddress(
  address
) {

  const value =
    String(
      address || ""
    );

  if (
    value.length <= 14
  ) {
    return value;
  }

  return (
    value.slice(0, 6) +
    "..." +
    value.slice(-6)
  );
}


// =========================
// COPY
// =========================

async function copyText(
  text
) {

  try {

    await navigator.clipboard.writeText(
      text
    );

    alert(
      "Copied!"
    );

  } catch {

    alert(
      "Copy failed. Please copy manually."
    );
  }
}


// =========================
// ESCAPE ATTRIBUTE
// =========================

function escapeAttribute(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /'/g,
      "\\'"
    )
    .replace(
      /"/g,
      "&quot;"
    );
}


// =========================
// NUMBER
// =========================

function formatNumber(
  value
) {

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return "0";
  }

  return number.toLocaleString(
    "en-US",
    {
      maximumFractionDigits: 2
    }
  );
}


// =========================
// INTEGER
// =========================

function formatInteger(
  value
) {

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return "0";
  }

  return Math.round(
    number
  ).toLocaleString(
    "en-US"
  );
}


// =========================
// PERCENT
// =========================

function formatPercent(
  value
) {

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return "0%";
  }

  return (
    number
      .toFixed(2)
      .replace(
        /\.00$/,
        ""
      ) +
    "%"
  );
}


// =========================
// PRICE
// =========================

function formatPrice(
  value
) {

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return "0";
  }

  if (
    number < 0.00000001
  ) {
    return number.toFixed(14);
  }

  if (
    number < 0.000001
  ) {
    return number.toFixed(12);
  }

  if (
    number < 0.001
  ) {
    return number.toFixed(9);
  }

  if (
    number < 1
  ) {
    return number.toFixed(6);
  }

  return number.toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }
  );
}


// =========================
// ESCAPE HTML
// =========================

function escapeHtml(
  value
) {

  const div =
    document.createElement(
      "div"
    );

  div.textContent =
    String(
      value ?? ""
    );

  return div.innerHTML;
}


// =========================
// KEYBOARD
// =========================

function setupKeyboardEvents() {

  const tokenInput =
    document.getElementById(
      "tokenInput"
    );

  const passwordInput =
    document.getElementById(
      "passwordInput"
    );

  if (passwordInput) {

    passwordInput.addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Enter"
        ) {

          event.preventDefault();

          login();
        }
      }
    );
  }

  if (tokenInput) {

    tokenInput.addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Enter"
        ) {

          event.preventDefault();

          scanToken();
        }
      }
    );
  }
}


// =========================
// LOAD
// =========================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    checkLogin();

    setupKeyboardEvents();

  }
);
