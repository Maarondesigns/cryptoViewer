const DAILY_ADJUSTED = "TIME_SERIES_DAILY_ADJUSTED";
const MONTHLY_ADJUSTED = "TIME_SERIES_MONTHLY_ADJUSTED";
const INTRADAY = "TIME_SERIES_INTRADAY";
const CRYPTO_DAILY = "DIGITAL_CURRENCY_DAILY";
const CRYPTO_WEEKLY = "DIGITAL_CURRENCY_WEEKLY";
const CRYPTO_MONTHLY = "DIGITAL_CURRENCY_MONTHLY";

const timePeriod = (type, period, min) => {
  let f = "";
  if (type == "crypto") {
    f = period == "daily" ? CRYPTO_DAILY : CRYPTO_WEEKLY;
    switch (period) {
      case "daily":
        f = CRYPTO_DAILY;
        break;
      case "weekly":
        f = CRYPTO_WEEKLY;
        break;
      case "monthly":
        f = CRYPTO_MONTHLY;
        break;
      default:
        f = "";
    }
    let m = "USD";
    return `function=${f}&market=${m}`;
  } else if (type == "stock") {
    switch (period) {
      case "intraday":
        f = INTRADAY;
        break;
      case "daily":
        f = DAILY_ADJUSTED;
        break;
      case "monthly":
        f = MONTHLY_ADJUSTED;
        break;
      default:
        f = "";
    }
    return `function=${f}&interval=${min}min`;
  }
};
export default timePeriod;
