import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import cors from "cors";
import formAVQuery from "./constants.js";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import WebSocket from "ws";

const app = express();

app.use(cors());
app.options("*", cors());

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

dotenv.config();

function getSymbPath(symbol, m) {
  symbol = symbol.toUpperCase();
  let date = new Date();
  if (m) date = new Date(date.getTime() + m * 24 * 60 * 60 * 1000);
  let dateString = `${date.getMonth() + 1}_${date.getDate()}`;
  return `${process.cwd()}/data/${symbol}_${dateString}.json`;
}
function formatDate(date) {
  var d = new Date(date),
    month = "" + (d.getMonth() + 1),
    day = "" + d.getDate(),
    year = d.getFullYear();

  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;

  return [year, month, day].join("-");
}

function readPath(path) {
  let data;
  if (fs.existsSync(path)) data = fs.readFileSync(path, "utf8");
  if (!data) return;
  try {
    data = JSON.parse(data);
    return data;
  } catch (err) {
    console.log({ err, path, data });
    return;
  }
}

const wss = new WebSocket.Server({ port: 8081 });
let queues = {};

function serializeTrade(symbol, data, runFromQueue) {
  symbol = symbol.toUpperCase();
  if (!queues[symbol]) queues[symbol] = [];
  let queue = queues[symbol];

  let d = runFromQueue
    ? data
    : {
        t: data.timestamp * 1000,
        v: data.price,
        vol: data.amount,
        type: data.type,
      };
  if (!runFromQueue) queue.push(d);
  if (queue.length > 1 && !runFromQueue) {
    console.log("queueLength", queue.length);
    return;
  }

  if (!fs.existsSync(getSymbPath(symbol)))
    fs.writeFileSync(getSymbPath(symbol), "[]");
  fs.readFile(getSymbPath(symbol), "utf8", function (err, btcData) {
    if (err) console.log({ err });
    if (!btcData) console.log("NO DATA", { btcData });
    try {
      btcData = JSON.parse(btcData);
    } catch (err) {
      //console.log(err);
    }

    if (btcData) {
      btcData.push(d);
      console.log(`${symbol}_DataLength`, btcData.length);
      fs.writeFile(
        getSymbPath(symbol),
        JSON.stringify(btcData),
        function (err) {
          if (err) console.log({ err });
          wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ symbol, d }));
            }
          });
          queue.shift();
          if (queue.length) serializeTrade(symbol, queue[0], true);
        }
      );
    }
  });
}

function startWebSocket(symbol) {
  var subscribeMsg = {
    event: `bts:subscribe`,
    data: {
      channel: `live_trades_${symbol}usd`,
    },
  };

  var ws;
  initWebsocket();

  function initWebsocket() {
    ws = new WebSocket("wss://ws.bitstamp.net");

    ws.onopen = function () {
      ws.send(JSON.stringify(subscribeMsg));
    };

    ws.onmessage = function (evt) {
      let response = JSON.parse(evt.data);
      switch (response.event) {
        case "trade": {
          serializeTrade(symbol, response.data);
          break;
        }
        case "bts:request_reconnect": {
          initWebsocket();
          break;
        }
      }
    };

    ws.onclose = function () {
      console.log("Websocket connection closed");
      initWebsocket();
    };
  }
}
startWebSocket("btc");
startWebSocket("eth");

app.get("/:symb/minutecsv", cors(), async (req, res) => {
  console.log(`GET MINUTE CSV FOR ${req.params.symb}`);
  res.sendFile(
    `${process.cwd()}/data/gemini_${req.params.symb}USD_2020_1min.csv`
  );
});

app.get("/:symb/live", cors(), async (req, res) => {
  let btcData = [];
  for (let i = -4; i < 1; i++) {
    let data = readPath(getSymbPath(req.params.symb, i));
    if (data && data.length) btcData = [...btcData, ...data];
  }
  res.json(btcData);
});

app.post("/stock", cors(), async (req, res) => {
  const body = JSON.parse(JSON.stringify(req.body));
  const { tickers, timePeriod, min, type } = body;
  console.log("requesting", body);
  let to = new Date().getTime();
  let from = to - 4 * 24 * 60 * min * 60 * 1000;
  to = formatDate(to);
  from = formatDate(from);
  let uri = `https://www.alphavantage.co/query?${formAVQuery(
    type,
    timePeriod,
    min
  )}&symbol=${tickers}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`;
  console.log({ uri });
  const request = await fetch(
    // `https://api.polygon.io/v2/aggs/ticker/${tickers}/range/${min}/minute/${from}/${to}?unadjusted=true&sort=asc&apiKey=${process.env.POLYGON_KEY}`
    uri
  );
  const data = await request.json();
  let error = data.Note || data["Error Message"];
  if (error) {
    console.log("stocks error", error);
    res.json({ error });
  } else {
    res.json({ data: data, status: "done" });
  }
});

app.post("/stocks", async (req, res) => {
  //less than 5 stocks per minute
  const body = JSON.parse(JSON.stringify(req.body));
  const { tickers, timePeriod, min, type } = body;
  console.log("requesting", body);
  let stocks = await tickers.map(async (ticker) => {
    const request = await fetch(
      `https://www.alphavantage.co/query?${formAVQuery(
        type,
        timePeriod,
        min
      )}&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
    );
    const data = await request.json();
    return data;
  });

  Promise.all(stocks)
    .then((values) => {
      if (values[0].Note) {
        console.log("stocks error", values[0]);
        res.json({ error: values[0].Note });
      } else {
        res.json({ data: values, status: "done" });
      }
    })
    .catch((error) => {
      console.log("stocks error", error);
      res.json({ error: error });
    });
});

app.post("/stocks-unlimited", async (req, res) => {
  //unlimited stocks in 12 seconds X number of tickers (i.e 10 tickers = 120 seconds to get data.)
  const body = JSON.parse(JSON.stringify(req.body));
  const { tickers, type } = body;
  console.log("stocks-api 74 | tickers length", tickers.length);
  let stocksArray = [];
  console.log("stocks-api.js 14 | body", body.tickers);
  await tickers.forEach(async (ticker, index) => {
    setTimeout(async () => {
      const request = await fetch(
        `https://www.alphavantage.co/query?function=${formAVQuery(
          type
        )}&symbol=${ticker}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
      );
      const data = await request.json();
      stocksArray.push(Object.values(data));
      console.log("stocks-api 84 | stocks array", stocksArray);
      if (stocksArray.length === tickers.length) {
        res.json({ tickers: stocksArray });
      }
    }, index * 12000);
  });
});

app.listen(process.env.PORT || 8080, () => {
  console.log("index.js 6 | server started...");
});

process
  .on("unhandledRejection", (reason, p) => {
    console.error({ reason }, "Unhandled Rejection at Promise", { p });
  })
  .on("uncaughtException", (err) => {
    console.error("UNCAUGHT EXCEPTION THROWN", { err });
    process.exit(1);
  });

process.on("exit", (code) => {
  // Only synchronous calls
  console.log(`Process exited with code: ${code}`);
});
