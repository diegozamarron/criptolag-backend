import { FOREX_API_KEY, TOKEN_POOL_ADDRESS } from '../config.js';

const TOKEN_REFRESH_MS = 60 * 1000;
const FOREX_REFRESH_MS = 24 * 60 * 60 * 1000;
const FOREX_RETRY_MS = 60 * 60 * 1000;
// Older than this, the price is treated as unknown rather than sold at a stale rate
const MAX_PRICE_AGE_MS = 15 * 60 * 1000;

let cachedTokenInfo = null;
let lastUpdatedTokenInfo = 0;

let cachedUsdToMxn = 18.5; // fallback until the first successful fetch
let lastUsdToMxnFetch = 0;

// { price_mxn, lastUpdated }, or null if there is no recent price
export const getTokenInfo = () =>
  cachedTokenInfo && Date.now() - cachedTokenInfo.lastUpdated < MAX_PRICE_AGE_MS ? cachedTokenInfo : null;

// MXN value of a CRL amount at the current price, or null if there is no recent price
export const crlToMxn = (amountCRL) => {
  const tokenInfo = getTokenInfo();
  return tokenInfo ? amountCRL * tokenInfo.price_mxn : null;
};

// Don't call again until the retry delay passes, so a bad key or outage
// doesn't burn the Currencylayer quota once a minute
const backOffForex = () => {
  lastUsdToMxnFetch = Date.now() - FOREX_REFRESH_MS + FOREX_RETRY_MS;
};

// Live USD -> MXN rate from Currencylayer (needs FOREX_API_KEY), cached for 24 hours
const fetchUsdToMxn = async () => {
  const now = Date.now();
  if (now - lastUsdToMxnFetch < FOREX_REFRESH_MS) return cachedUsdToMxn;

  try {
    const url = `http://api.currencylayer.com/live?access_key=${FOREX_API_KEY}&currencies=MXN`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.quotes || typeof data.quotes.USDMXN !== 'number' || !(data.quotes.USDMXN > 0)) {
      console.warn('USD->MXN rate not found in API response, using cached/fallback');
      backOffForex();
      return cachedUsdToMxn;
    }

    cachedUsdToMxn = parseFloat(data.quotes.USDMXN);
    lastUsdToMxnFetch = now;
    console.log('USD->MXN rate updated:', cachedUsdToMxn);
    return cachedUsdToMxn;
  } catch (err) {
    console.error('Error fetching USD->MXN rate:', err);
    backOffForex();
    return cachedUsdToMxn;
  }
};

// CRL price in USD from GeckoTerminal, converted to MXN
const updateTokenInfo = async () => {
  const now = Date.now();
  if (now - lastUpdatedTokenInfo < TOKEN_REFRESH_MS) return;

  const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${TOKEN_POOL_ADDRESS}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`GeckoTerminal HTTP error: ${response.status}`);
      return;
    }

    const data = await response.json();
    const priceUSD = parseFloat(data?.data?.attributes?.base_token_price_usd);
    if (!Number.isFinite(priceUSD) || priceUSD <= 0) {
      console.error('GeckoTerminal returned no usable price:', data?.data?.attributes?.base_token_price_usd);
      return;
    }
    const usdToMxn = await fetchUsdToMxn();

    cachedTokenInfo = {
      price_mxn: priceUSD * usdToMxn,
      lastUpdated: now,
    };
    lastUpdatedTokenInfo = now;
    console.log('Token info updated via GeckoTerminal');
  } catch (error) {
    console.error('GeckoTerminal API error:', error);
  }
};

// Fetch now, then refresh every minute
export const startPriceUpdates = () => {
  updateTokenInfo();
  setInterval(updateTokenInfo, TOKEN_REFRESH_MS);
};
