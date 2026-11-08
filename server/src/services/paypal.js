import axios from "axios";

const paypalBase = () => process.env.PAYPAL_ENV === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
let tokenCache;

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function getAccessToken() {
  if (!paypalConfigured()) throw Object.assign(new Error("PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET."), { status: 503 });
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) return tokenCache.value;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const { data } = await axios.post(`${paypalBase()}/v1/oauth2/token`, "grant_type=client_credentials", { headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 });
  tokenCache = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.value;
}

export async function paypalGet(path, params = {}) {
  const token = await getAccessToken();
  const { data } = await axios.get(`${paypalBase()}${path}`, { params, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, timeout: 20000 });
  return data;
}

export async function getBalances(asOfTime) {
  const data = await paypalGet("/v1/reporting/balances", asOfTime ? { as_of_time: asOfTime } : {});
  return { ...data, provenance: { endpoint: "/v1/reporting/balances", environment: process.env.PAYPAL_ENV === "production" ? "production" : "sandbox", retrieved_at: new Date().toISOString(), freshness_note: "PayPal states balances may take up to three hours to appear." } };
}

export function normalizePayPalBalances(response) {
  if (!Array.isArray(response?.balances)) throw Object.assign(new Error("PayPal returned a balance response without a balances list"), { status: 502 });
  return response.balances.map((balance) => ({
    currency: balance.currency || balance.available_balance?.currency_code || balance.total_balance?.currency_code || null,
    available_balance: balance.available_balance?.value ?? null,
    total_balance: balance.total_balance?.value ?? null,
    withheld_balance: balance.withheld_balance?.value ?? null
  }));
}

export function selectAvailablePayPalBalance(response, currencyCode) {
  const balances = normalizePayPalBalances(response);
  if (!balances.length) throw Object.assign(new Error("PayPal returned no currency balances"), { status: 404 });
  let selected;
  if (currencyCode) {
    const requested = String(currencyCode).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(requested)) throw Object.assign(new Error("currency_code must be a three-letter ISO currency code"), { status: 400 });
    selected = balances.find(balance => balance.currency === requested);
    if (!selected) throw Object.assign(new Error(`PayPal has no ${requested} balance. Available currencies: ${balances.map(balance => balance.currency).join(", ")}`), { status: 400 });
  } else if (balances.length === 1) selected = balances[0];
  else throw Object.assign(new Error(`Choose a currency before forecasting. Available currencies: ${balances.map(balance => balance.currency).join(", ")}`), { status: 400 });

  const amount = Number(selected.available_balance);
  if (!Number.isFinite(amount)) throw Object.assign(new Error(`PayPal did not return an available balance for ${selected.currency}; refusing to substitute total or withheld funds`), { status: 502 });
  return { amount, currency: selected.currency, as_of: response.last_refresh_time || response.as_of_time || null, source: "PAYPAL_REPORTING_AVAILABLE_BALANCE" };
}

export async function listTransactions({ startDate, endDate } = {}) {
  const now = new Date();
  const end = endDate || now.toISOString();
  const start = startDate || new Date(now.getTime() - 30 * 86400000).toISOString();
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) throw Object.assign(new Error("start_date and end_date must be valid timestamps in increasing order"), { status: 400 });
  if (Date.parse(end) - Date.parse(start) > 31 * 86400000) throw Object.assign(new Error("Transaction Search date range cannot exceed 31 days"), { status: 400 });
  const records = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= 100) {
    const result = await paypalGet("/v1/reporting/transactions", { start_date: start, end_date: end, page_size: 100, page, fields: "all" });
    totalPages = Number(result.total_pages || 1);
    if (!Number.isFinite(totalPages) || totalPages < 1 || totalPages > 100) throw Object.assign(new Error("Transaction Search result exceeds the configured 10,000-record page limit"), { status: 502 });
    for (const item of result.transaction_details || []) {
      const info = item.transaction_info || {};
      const amount = info.transaction_amount || {};
      const eventCode = info.transaction_event_code;
      const statusCode = String(info.transaction_status || "").toUpperCase();
      const status = ["T1107", "T1109", "T1115", "T1120"].includes(eventCode) ? "REFUNDED"
        : ["T1100", "T1101", "T1102", "T1103", "T1104", "T1105", "T1106", "T1114", "T1116", "T1118", "T1119"].includes(eventCode) ? "REVERSED"
          : ({ S: "COMPLETED", P: "PENDING", D: "DENIED", V: "REVERSED" }[statusCode] || statusCode || "UNKNOWN");
      records.push({
        id: info.transaction_id,
        date: info.transaction_initiation_date,
        description: info.transaction_subject || "PayPal transaction",
        amount: amount.value,
        currency: amount.currency_code,
        type: Number(amount.value) < 0 ? "DEBIT" : "CREDIT",
        status,
        paypal_status_code: statusCode,
        transaction_event_code: eventCode,
        fee: info.fee_amount,
        related_transaction_id: info.paypal_reference_id,
        source: "PAYPAL_TRANSACTION_SEARCH",
        provenance: { endpoint: "/v1/reporting/transactions", retrieved_at: new Date().toISOString(), environment: process.env.PAYPAL_ENV === "production" ? "production" : "sandbox" }
      });
    }
    page++;
  }
  const unique = new Map(records.map(record => [`${record.id}:${record.date}:${record.transaction_event_code}:${record.amount}:${record.currency}`, record]));
  return [...unique.values()];
}
