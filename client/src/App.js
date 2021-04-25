import React, { Component } from "react";
import * as d3 from "d3";
import equal from "fast-deep-equal";

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      refresh: false,
      view: "chart",
      results: [],
      stocks: [],
      timeSeries: "daily",
      previousQueries: [],
      lookupType: "crypto",
      gettingLivePrice: true,
      livePriceInterval: 1,
      barWidth: 6,
      margin: { top: 10, right: 70, bottom: 40, left: 30 },
      // myProfitTarget: 500,
      // myBuyPrice: { BTC: 50259.96, ETH: 1507 },
      // myBuyQuantity: { BTC: 0.07757734, ETH: 2.54707373 },
      myBuyTime: {
        BTC: new Date("2021-02-24 22:22:00").getTime(),
        ETH: new Date("2021-03-01 05:11:00").getTime(),
      },
      colors: {
        green: "#77e15e",
        lightgreen: "green",
        red: "#fd6838",
        lightred: "red",
      },
    };
    this.updateChart = this.updateChart.bind(this);
    this.updateCharts = this.updateCharts.bind(this);
    this.refresh = this.refresh.bind(this);
  }

  componentDidMount() {
    window.addEventListener("resize", this.refresh, false);
    this.openBitStampWebSocket();
    ["ltcusd", "linkusd", "omgusd", "algousd", "aaveusd"].forEach((pair) => {
      this.getOtherCryptos(pair);
    });
    ["BTC", "ETH"].forEach((s) => {
      d3.csv(`http://localhost:8080/${s}/minutecsv`).then((data) => {
        let { realtimeResults } = this.state;
        data = data.map((d) => {
          return { t: +d["Unix Timestamp"], v: +d["Close"], vol: +d["Volume"] };
        });
        data.sort((a, b) => a.t - b.t);
        realtimeResults[s] = [...data, ...realtimeResults[s]];
        this.setState({ realtimeResults });
      });
    });
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.refresh, false);
    if (this.state.websocket) this.state.websocket.close();
  }

  componentDidUpdate() {
    this.updateCharts();
  }

  refresh() {
    this.setState({ refresh: !this.state.refresh });
  }
  updateCharts() {
    let { realtimeResults } = this.state;
    if (realtimeResults)
      Object.keys(realtimeResults).forEach((k) => {
        this.updateChart(k);
      });
  }

  getOtherCryptos(pair) {
    let that = this;
    var subscribeMsg = {
      event: "bts:subscribe",
      data: {
        channel: `live_trades_${pair}`,
      },
    };

    function serializeTrade(data) {
      let { currentPrices } = that.state;
      if (!currentPrices) currentPrices = {};
      let p = pair.replace("usd", "");
      let poc = currentPrices[p] ? currentPrices[p].price : 0;
      data.color = data.price > poc ? "green" : "red";
      currentPrices[p] = data;
      that.setState({ currentPrices });
    }

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
            serializeTrade(response.data);
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
        // initWebsocket();
      };
    }
  }

  openBitStampWebSocket() {
    // let rtr = localStorage.getItem("realtimeResults");
    // this.setState({ realtimeResults: JSON.parse(rtr) });
    let that = this;
    Promise.all(
      ["BTC", "ETH"].map((x) => {
        return fetch(`http://localhost:8080/${x}/live`).then((res) => {
          return res.json().then((data) => {
            // if (x === "BTC")
            // console.log(
            //   JSON.stringify(
            //     data.map((d) => {
            //       return [d.t, d.v];
            //     })
            //   )
            // );
            return data;
          });
        });
      })
    ).then((res) => {
      res.forEach((data, i) => {
        let symbol = ["BTC", "ETH"][i];
        let now = new Date().getTime();
        let { realtimeResults, currentPrices } = that.state;
        if (!realtimeResults) realtimeResults = {};
        realtimeResults[symbol] = data;
        realtimeResults[symbol].forEach(
          (x) => (x.isNew = now - x.t < 1000 ? true : false)
        );
        if (!currentPrices) currentPrices = {};
        let cp = data.sort((a, b) => a.t - b.t)[data.length - 1];
        currentPrices[symbol] = cp;
        that.setState({ realtimeResults, currentPrices });
      });

      var ws;
      initWebsocket();

      function updateStateResults(obj) {
        let { symbol, d } = obj;
        let now = new Date().getTime();
        d.isNew = true;
        // d = {
        //   t: d.timestamp * 1000,
        //   v: d.price,
        //   vol: d.amount,
        //   type: d.type,
        //   isNew: true,
        // };
        let { realtimeResults, currentPrices } = that.state;
        if (!realtimeResults) realtimeResults = {};
        if (!currentPrices) currentPrices = {};
        currentPrices[symbol] = d;
        let data = realtimeResults[symbol];
        if (!data) data = [d];
        else {
          data.forEach((x) => (x.isNew = now - x.t < 1000 ? true : false));
          data.push(d);
        }
        realtimeResults[symbol] = data;
        // localStorage.setItem(
        //   "realtimeResults",
        //   JSON.stringify(realtimeResults)
        // );
        that.setState({ realtimeResults, currentPrices });
        let headers = document.querySelector(`#liveTrades_${symbol} .headers`);
        if (headers) {
          let div = document.createElement("div");
          div.classList.add(d.type === 1 ? "sell" : "buy");
          div.classList.add("isNew");
          div.innerHTML = `
              <div className="timestamp">${that.getTimeFromDate(
                new Date(d.t)
              )}</div>
              <div className="price">$${that.formatYVal(d.v, 2)}</div>
              <div className="amount">${d.vol}</div>
              `;
          headers.parentNode.insertBefore(div, headers.nextSibling);
          that.updateChart(symbol);
          [...headers.parentNode.childNodes].forEach((node, i) => {
            if (i > 100) node.remove();
          });
        }
        let cp = document.getElementById(`currentPrice_${symbol}`);
        if (cp) {
          cp.innerHTML = `$${that.formatYVal(d.v, 2)}`;
          cp.style.color = d.type === 1 ? "#fd6838" : "#77e15e";
        }
        [
          { text: "day", time: 24 * 60 * 60 * 1000 },
          { text: "hour", time: 60 * 60 * 1000 },
          { text: "tenMinutes", time: 10 * 60 * 1000 },
        ].forEach((tp) => {
          let { text, time } = tp;
          let hourAgo = new Date().getTime() - time;
          let lastHour = realtimeResults[symbol].filter((x) => {
            return x.t > hourAgo;
          });
          let hMax = d3.max(lastHour.map((x) => x.v)),
            hMin = d3.min(lastHour.map((x) => x.v)),
            hChange = ((d.v - lastHour[0].v) / hMax) * 100,
            hSell =
              (lastHour.filter((x) => x.type == 1).length / lastHour.length) *
              100,
            hBuy =
              (lastHour.filter((x) => x.type == 0).length / lastHour.length) *
              100;
          let hH = document.getElementById(`${symbol}_${text}High`);
          hH.innerHTML = `$${that.formatYVal(hMax, 2)}`;
          let hL = document.getElementById(`${symbol}_${text}Low`);
          hL.innerHTML = `$${that.formatYVal(hMin, 2)}`;
          let hC = document.getElementById(`${symbol}_${text}Change`);
          hC.innerHTML = `${that.formatYVal(hChange, 2)}%`;
          hC.style.color = hChange < 0 ? "#fd6838" : "#77e15e";
          let hS = document.getElementById(`${symbol}_${text}Sell`);
          hS.innerHTML = `${that.formatYVal(hSell, 2)}%`;
          let hB = document.getElementById(`${symbol}_${text}Buy`);
          hB.innerHTML = `${that.formatYVal(hBuy, 2)}%`;
        });
      }

      function initWebsocket() {
        console.log("start websocket");
        ws = new WebSocket("ws://localhost:8081"); //"wss://ws.bitstamp.net");

        ws.onopen = function () {
          ws.send(JSON.stringify());
        };

        ws.onmessage = function (evt) {
          let response = JSON.parse(evt.data);
          updateStateResults(response);
          // switch (response.event) {
          //   case "trade": {
          //     serializeTrade(response.data);
          //     break;
          //   }
          //   case "bts:request_reconnect": {
          //     initWebsocket();
          //     break;
          //   }
          // }
        };

        ws.onclose = function () {
          console.log("Websocket connection closed");
          // initWebsocket();
        };
        that.setState({ websocket: ws });
      }
    });
  }

  getTotalMilliseconds() {
    let { barWidth, margin, livePriceInterval } = this.state;
    let width = window.innerWidth - 200 - 50 - margin.left - margin.right;
    let max = Math.floor(width / barWidth);
    return max * livePriceInterval * 60 * 1000;
  }

  getStartTimeInView() {
    return new Date().getTime() - this.getTotalMilliseconds();
  }

  updateChart(symbol) {
    let {
      results,
      view,
      lookupType,
      realtimeResults,
      livePriceInterval,
    } = this.state;
    if (
      realtimeResults &&
      realtimeResults[symbol] &&
      realtimeResults[symbol].length > 1
    ) {
      let start = this.getStartTimeInView();
      let group1 = [],
        group2 = [],
        miniGroup = [];
      // let now = new Date();
      // let startOfToday = new Date(
      //   `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} 00:00:00`
      // );
      // let r = results.length
      //   ? results.find(
      //       (x) => x["Meta Data"]["2. Digital Currency Code"] === symbol
      //     )
      //   : undefined;
      // if (r && livePriceInterval == 24 * 60) {
      //   let now = new Date();
      //   startOfToday = new Date(
      //     `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} 00:00:00`
      //   );
      //   let k = Object.keys(r).filter((x) => x != "Meta Data")[0];
      //   group1 = Object.keys(r[k])
      //     .filter((date) => {
      //       return (
      //         new Date(date + " 00:00:00").getTime() < startOfToday.getTime()
      //       );
      //     })
      //     .map((date) => {
      //       return {
      //         date: new Date(date + " 00:00:00").getTime(), //d3.timeParse(tp)(date),
      //         data: r[k][date],
      //       };
      //     })
      //     .sort((a, b) => a.date - b.date);
      // }
      realtimeResults[symbol]
        .filter((d) => {
          let t = start; //startOfToday ? startOfToday.getTime() : startOfToday;
          return d.t > t;
        })
        .forEach((d) => {
          if (d) {
            if (
              miniGroup[0] &&
              (d.t - miniGroup[0].t) / 1000 / 60 < livePriceInterval
            )
              miniGroup.push(d);
            else {
              group2.push(miniGroup);
              miniGroup = [d];
            }
          }
        });
      if (miniGroup.length) group2.push(miniGroup);
      this.drawChart(symbol, [
        ...group1,
        ...group2
          .map((g, i) => {
            if (!g || !g.length) return;
            let o = g[0],
              c = group2[i + 1];
            if (c) c = c[0];
            else c = g[g.length - 1];
            let min, max;
            g.forEach((x) => {
              if (!min || x.v < min) min = x.v;
              if (!max || x.v > max) max = x.v;
            });
            let data = {};
            data["1a. open (USD)"] = o.v;
            data["4a. close (USD)"] = c.v;
            data["3a. low (USD)"] = min;
            data["2a. high (USD)"] = max;
            return {
              date: o.t,
              data,
            };
          })
          .filter((x) => x),
      ]);
    } else if (results.length && view == "chart")
      results.forEach((r, i) => {
        let k = Object.keys(r).filter((x) => x != "Meta Data")[0];
        let tp = k.includes("min") ? "%Y-%m-%d %H:%M:%S" : "%Y-%m-%d";
        // let id = r.ticker;
        let id =
          lookupType == "stock"
            ? r["Meta Data"]["2. Symbol"]
            : r["Meta Data"]["2. Digital Currency Code"];

        if (id)
          setTimeout(() => {
            this.drawChart(
              id.toUpperCase(),
              Object.keys(r[k]).map((date) => {
                return {
                  date: new Date(date).getTime(), //d3.timeParse(tp)(date),
                  data: r[k][date],
                };
              })
            );
          }, 500);
      });
  }

  getStock(type, tickers, timeSeries) {
    return fetch(`http://localhost:8080/stock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        tickers,
        type,
        timePeriod: timeSeries.split(" ")[0],
        min: timeSeries.split(" ")[1],
      }),
    }).then((res) => {
      res.json().then((data) => {
        if (data.error) alert(data.error);
        else {
          let results = [data.data];
          let pq = { tickers, timeSeries, results, type };
          let previousQueries = [...this.state.previousQueries, pq];
          this.setState({ results, previousQueries });
        }
      });
    });
  }

  getMultipleStocks(type, tickers, timeSeries) {
    return fetch(`http://localhost:8080/stocks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        tickers,
        type,
        timePeriod: timeSeries.split(" ")[0],
        min: timeSeries.split(" ")[1],
      }),
    }).then((res) => {
      res.json().then((data) => {
        if (data.error) alert(data.error);
        else {
          let results = data.data;
          let pq = { tickers, timeSeries, results, type };
          let previousQueries = [...this.state.previousQueries, pq];
          this.setState({ results, previousQueries });
        }
      });
    });
  }

  inputs() {
    let {
      barWidth,
      gettingLivePrice,
      livePriceInterval,
      currentPrices,
    } = this.state;
    if (gettingLivePrice)
      return (
        <div>
          <div>BTC Live Price Interval:</div>
          <select
            style={{ width: "100%" }}
            value={livePriceInterval}
            onChange={(e) => {
              this.setState({ livePriceInterval: e.target.value });
              {
                /* if (e.target.value == 24 * 60)
                this.getMultipleStocks("crypto", ["BTC", "ETH"], "daily"); */
              }
            }}
          >
            <option value={1}>1 min</option>
            <option value={5}>5 min</option>
            <option value={10}>10 min</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>1 hr</option>
            <option value={24 * 60}>1 day</option>
          </select>
          {currentPrices ? (
            <div
              style={{
                border: "solid 1px rgba(255,255,255,0.1)",
                margin: "5px 0",
                fontSize: "12px",
                position: "absolute",
                top: "12px",
                left: "228px",
                width: "110px",
              }}
            >
              <div style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}>
                Other Cryptos
              </div>
              {Object.keys(currentPrices)
                .filter(
                  (x) => x.toUpperCase() != "BTC" && x.toUpperCase() != "ETH"
                )
                .map((symbol) => {
                  let d = currentPrices[symbol];
                  return (
                    <div
                      key={symbol}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        borderBottom: "solid 1px rgba(255,255,255,0.1)",
                      }}
                    >
                      <div
                        style={{
                          borderRight: "solid 1px rgba(255,255,255,0.1)",
                        }}
                      >
                        {symbol.toUpperCase()}
                      </div>
                      <div style={{ color: this.state.colors[d.color] }}>
                        ${this.formatYVal(d.price)}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            ""
          )}
          {/* <div style={{ marginTop: "15px" }}>Bar Width</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto auto auto",
              maxWidth: "100px",
              margin: "2px auto 10px auto",
            }}
          >
            <div
              className="bar-width"
              onClick={() => {
                barWidth -= 1;
                if (barWidth < 3) barWidth = 3;
                this.setState({ barWidth });
              }}
            >
              -
            </div>
            <div>{this.state.barWidth - 2}px</div>
            <div
              className="bar-width"
              onClick={() => {
                barWidth += 1;
                if (barWidth > window.innerWidth / 2)
                  barWidth = window.innerWidth / 2;
                this.setState({ barWidth });
              }}
            >
              +
            </div>
          </div> */}
        </div>
      );
    return (
      <div>
        <span>Type: </span>
        <div style={{ display: "flex" }}>
          <select
            id="lookupType"
            style={{ width: "100%" }}
            defaultValue="stock"
            onChange={(e) => {
              let lookupType = e.target.value;
              let livePriceInterval = lookupType == "crypto" ? 24 * 60 : 1;
              this.setState({ lookupType, livePriceInterval });
            }}
          >
            <option value="stock">Stock</option>
            <option value="crypto">Crypto</option>
          </select>
        </div>
        <span>Time Series: </span>
        <div style={{ display: "flex" }}>
          <select
            id="timeSeries"
            style={{ width: "100%" }}
            defaultValue={
              this.state.lookupType == "stock" ? "intraday 1" : "daily"
            }
            onChange={(e) => {
              let v = e.target.value;
              let livePriceInterval =
                v === "daily" ? 24 * 60 : +e.target.value.split(" ")[1];
              this.setState({ livePriceInterval });
            }}
          >
            {this.state.lookupType == "stock" ? (
              <React.Fragment>
                <option value="daily">Daily</option>
                <option value="intraday 60">Intraday 60min</option>
                <option value="intraday 30">Intraday 30min</option>
                <option value="intraday 15">Intraday 15min</option>
                <option value="intraday 5">Intraday 5min</option>
                <option value="intraday 1">Intraday 1min</option>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </React.Fragment>
            )}
          </select>
        </div>
        <span>Tickers: </span>
        <div style={{ display: "flex" }}>
          <input
            id="tickers"
            style={{ width: "100%" }}
            type="text"
            onInput={(e) => {
              {
                /* let stocks = e.target.value
                .split(",")
                .filter((s) => s)
                .map((s) => s.trim());
              this.setState({ stocks }); */
              }
            }}
          ></input>
        </div>
      </div>
    );
  }

  buttons() {
    if (this.state.gettingLivePrice) return "";
    return (
      <div style={{ textAlign: "center", margin: "10px" }}>
        <div>
          <button
            onClick={() => {
              let type = this.state.lookupType;
              let timeSeries = document.getElementById("timeSeries").value;
              let tickers = document
                .getElementById("tickers")
                .value.split(",")
                .filter((s) => s)
                .map((s) => s.trim().toUpperCase());
              let pq = this.state.previousQueries.find(
                (x) =>
                  x.timeSeries == timeSeries &&
                  equal(x.tickers, tickers) &&
                  x.type == type
              );
              if (pq) {
                this.setState({ results: pq.results });
              } else
                tickers.length === 1
                  ? this.getStock(type, tickers[0], timeSeries)
                  : this.getMultipleStocks(type, tickers, timeSeries);
            }}
          >
            Get Prices
          </button>
        </div>
        <div>
          <button
            style={{ display: this.state.lookupType == "crypto" ? "" : "none" }}
            onClick={() => {
              let that = this;
              function getBTCValue() {
                fetch("http://localhost:8080/btclive").then((res) => {
                  res.json().then((data) => {
                    //let v = data.quoteResponse.result[0].regularMarketPrice;
                    //let t = new Date().getTime();
                    let { realtimeResults } = that.state;
                    if (!realtimeResults)
                      realtimeResults = { symbol: "BTC", data };
                    else realtimeResults.data = data;
                    let currentPrices = data.sort((a, b) => a.t - b.t)[
                      data.length - 1
                    ];
                    //realtimeResults.data.push({ t, v });
                    that.setState({ realtimeResults, currentPrices });
                    {
                      /* let parser = new DOMParser();
                  let htmlDoc = parser.parseFromString(data.html, "text/html");
                  let divs = [...htmlDoc.getElementsByTagName("DIV")];
                  divs.forEach((d) => {
                    let ih = d.innerHTML;
                    if (
                      !ih.includes("<") &&
                      ih.includes("United States Dollar")
                    ) {
                      let v = ih.split("United States Dollar")[0];
                      if (v) v = parseFloat(v.trim().replace(/,/g, ""));
                      if (!isNaN(v)) {
                        let { realtimeResults } = that.state;
                        if (!realtimeResults)
                          realtimeResults = { symbol: "BTC", data: [] };
                        let t = new Date().getTime();
                        realtimeResults.data.push({ t, v });
                        that.setState({ realtimeResults });
                      }
                    }
                  }); */
                    }
                    {
                      /* let el = htmlDoc.querySelector(".price-large");
                  if (el) {
                    let v = el.innerHTML.split("</span>")[1];
                    if (v) v = parseFloat(v.replace(/,/g, ""));
                    if (!isNaN(v)) {
                      let { realtimeResults } = that.state;
                      if (!realtimeResults)
                        realtimeResults = { symbol: "BTC", data: [] };
                      let t = new Date().getTime();
                      realtimeResults.data.push({ t, v });
                      that.setState({ realtimeResults });
                    }
                  } */
                    }
                  });
                });
              }
              this.setState({ gettingLivePrice: true, livePriceInterval: 1 });
              getBTCValue();
              setInterval(() => {
                getBTCValue();
              }, 30 * 1000);
            }}
          >
            Get Live BTC Price
          </button>
        </div>
      </div>
    );
  }

  list(r, height) {
    let k = Object.keys(r).filter((x) => x != "Meta Data")[0];
    let b = "solid 1px rgba(0,0,0,0.1)";
    let s = { borderRight: b, borderBottom: b };
    return (
      <div>
        <div
          style={{
            background: "lightgray",
            display: "grid",
            gridTemplateColumns: "40% 30% 30%",
            marginRight: "17px",
          }}
        >
          <div style={s}>Date/Time</div>
          <div style={s}>Open</div>
          <div style={s}>Close</div>
        </div>
        <div
          style={{
            borderBottom: "solid 1px rgba(0,0,0,0.4)",
            display: "grid",
            gridTemplateColumns: "40% 30% 30%",
            overflow: "auto",
            maxHeight: `${height}px`,
          }}
        >
          {Object.keys(r[k]).map((dateTime) => {
            return (
              <React.Fragment key={dateTime}>
                <div style={s}>{dateTime}</div>
                <div style={s}>{r[k][dateTime]["1. open"]}</div>
                <div style={s}>{r[k][dateTime]["4. close"]}</div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  drawChart(symbol, data) {
    let {
      lookupType,
      livePriceInterval,
      currentPrices,
      myBuyPrice,
      myBuyTime,
      myBuyQuantity,
      myProfitTarget,
      isHovering,
    } = this.state;

    let openK = "1. open",
      closeK = "4. close",
      lowK = "3. low",
      highK = "2. high";

    if (lookupType === "crypto") {
      openK = "1a. open (USD)";
      closeK = "4a. close (USD)";
      lowK = "3a. low (USD)";
      highK = "2a. high (USD)";
    }

    data.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let { results, margin, barWidth, colors } = this.state;
    let rl = 1; //results.length;
    let parentHeight = document
      .getElementById(`${symbol}_container`)
      .getBoundingClientRect().height;
    let width = window.innerWidth - 200 - 50 - margin.left - margin.right,
      height = parentHeight / rl - 120 - margin.top - margin.bottom;
    // let max = Math.floor(width / barWidth);
    let totalMilliseconds = this.getTotalMilliseconds();
    // if (data.length > max) {
    //   data = data.filter((x, i) => i > data.length - (max + 1));
    // }
    let that = this;

    //y axis values
    let dMin = d3.min(data, function (d) {
        return +d.data[lowK];
      }),
      dMax = d3.max(data, function (d) {
        return +d.data[highK];
      });

    dMin -= (dMax - dMin) * 0.1;
    dMax += (dMax - dMin) * 0.1;

    let breakEven, currentProfit;
    if (myBuyPrice && myBuyPrice[symbol]) {
      breakEven = myBuyPrice[symbol] * 1.003;
      if (dMin > myBuyPrice[symbol]) dMin = myBuyPrice[symbol];
      if (dMax < breakEven) dMax = breakEven;

      currentProfit =
        (currentPrices[symbol].v - breakEven) * myBuyQuantity[symbol];
    }
    // let targetSellPrice = myProfitTarget / myBuyQuantity + breakEven;

    // if (dMax < targetSellPrice * 1.005) dMax = targetSellPrice * 1.005;

    d3.select(`#${symbol}`).html("");

    var svg = d3
      .select(`#${symbol}`)
      .append("svg")
      .on("mousewheel", function (e) {
        let v = e.wheelDelta < 0 ? -1 : 1;
        barWidth += v;
        if (barWidth < 3) barWidth = 3;
        let max = Math.min(Math.round(window.innerWidth / 15), 50);
        if (barWidth > max) barWidth = max;
        that.setState({ barWidth });
      })
      .on("mousemove", function (e) {
        let coords = d3.pointer(e, this);
        let xV = coords[0] - margin.left,
          yV = coords[1] - margin.top;
        let i, d;
        data.forEach((dD, dI) => {
          if (
            Math.abs(dD.date - new Date(x.invert(xV - barWidth)).getTime()) <
            livePriceInterval * 60 * 1000
          ) {
            i = dI;
            d = dD;
          }
        });
        let xA = new Date(x.invert(xV));
        let yA = y.invert(yV);
        if (yA < dMin || xV > width) closeTT();
        else {
          hoverBar(i, d);
          showTempHoverLines(xV, yV, xA, yA);
          that.setState({ isHovering: { symbol, i, d, xV, xA, yV, yA } });
        }
      })
      .on("mouseleave", closeTT)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    // Add X axis --> it is a date format
    let lastDate = data[data.length - 1].date + livePriceInterval * 60 * 1000,
      firstDate = lastDate - totalMilliseconds;
    var x = d3.scaleTime().domain([firstDate, lastDate]).range([0, width]);

    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text");

    // Add Y axis
    var y = d3.scaleLinear().domain([dMin, dMax]).range([height, 0]);
    let viewRange = Math.round(((dMax - dMin) / dMax) * 10000) / 100 + "%";
    svg
      .append("g")
      .append("text")
      .attr("x", width)
      .attr("y", height / 2)
      .style("transform", "translate(-10px, -50px) rotate(-90deg)")
      .style("transform-origin", "100% 50%")
      .style("fill", "lightgray")
      .style("font-size", "12px")
      .text(`View Range: ${viewRange}`);

    svg
      .append("g")
      .attr("transform", `translate(${width},0)`)
      .call(d3.axisRight(y));

    svg
      .selectAll(".line")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", "line")
      .attr("id", function (d, i) {
        return `${symbol}_line_${i}`;
      })
      .attr("data-color", function (d) {
        return +d.data[openK] > +d.data[closeK] ? "red" : "green";
      })
      .attr("fill", function (d) {
        return +d.data[openK] > +d.data[closeK]
          ? colors["red"]
          : colors["green"];
      })
      .attr("x", function (d) {
        return x(d.date) + barWidth * 0.5 - 1;
      })
      .attr("width", 2)
      .attr("y", function (d) {
        return Math.min(y(+d.data[highK]), y(+d.data[lowK]));
      })
      .attr("height", function (d) {
        let v = Math.abs(y(+d.data[lowK]) - y(+d.data[highK]));
        if (v === 0) v = 1;
        return v;
      });

    let blurVal = barWidth / 8;
    var filter = svg
      .append("defs")
      .append("filter")
      .attr("id", "blur")
      .append("feGaussianBlur")
      .attr("stdDeviation", blurVal);

    svg
      .selectAll(".barblur")
      .data(data)
      .enter()
      .append("rect")
      .attr("filter", "url(#blur)")
      .attr("class", "barblur")
      .attr("fill", function (d) {
        return +d.data[openK] > +d.data[closeK]
          ? colors["red"] + "55"
          : colors["green"] + "aa";
        // +d.data[openK] > +d.data[closeK] ? "#44caff33" : "#44caffbb";
      })
      .attr("x", function (d) {
        return x(d.date) - blurVal / 2;
      })
      .attr("width", barWidth + blurVal)
      .attr("y", function (d) {
        return Math.min(y(+d.data[openK]), y(+d.data[closeK])) - blurVal / 2;
      })
      .attr("height", function (d) {
        let v = Math.abs(y(+d.data[closeK]) - y(+d.data[openK]));
        if (v < 2) v = 2;
        return v + blurVal;
      });

    svg
      .selectAll(".bar")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("id", function (d, i) {
        return `${symbol}_bar_${i}`;
      })
      .attr("data-color", function (d) {
        return +d.data[openK] > +d.data[closeK] ? "red" : "green";
      })
      .attr("fill", function (d) {
        return +d.data[openK] > +d.data[closeK]
          ? colors["red"]
          : colors["green"];
      })
      .attr("x", function (d) {
        return x(d.date) + 1;
      })
      .attr("width", barWidth - 2)
      .attr("y", function (d) {
        return Math.min(y(+d.data[openK]), y(+d.data[closeK]));
      })
      .attr("height", function (d) {
        let v = Math.abs(y(+d.data[closeK]) - y(+d.data[openK]));
        if (v < 2) v = 2;
        return v;
      });

    function hoverBar(i, d) {
      if (i == undefined || d == undefined) return;
      svg
        .selectAll([".bar", ".line"])
        .attr("stroke", "")
        .attr("fill", function () {
          return colors[d3.select(this).attr("data-color")];
        });
      d3.select(`#${symbol}_bar_${i}`)
        .attr("stroke", "rgb(200,200,200)")
        .attr("fill", function () {
          return colors["light" + d3.select(this).attr("data-color")];
        });
      d3.select(`#${symbol}_line_${i}`)
        .attr("stroke", "rgb(200,200,200)")
        .attr("fill", function () {
          return colors["light" + d3.select(this).attr("data-color")];
        });
      let el = document.getElementById("tooltipData");
      el.style.display = "block";
      el.innerHTML = `
      <div><b>${new Date(d.date)}</b></div>
      <div>
      <div>O: ${that.formatYVal(d.data[openK], 2)}</div>
      <div>C: ${that.formatYVal(d.data[closeK], 2)}</div>
      <div>H: ${that.formatYVal(d.data[highK], 2)}</div>
      <div>L: ${that.formatYVal(d.data[lowK], 2)}</div>
      </div>
      `;
    }

    function showTempHoverLines(xV, yV, x, y) {
      svg.selectAll([".tempX", "#tempXText_background", ".tempY"]).remove();
      svg
        .append("line")
        .attr("class", "tempX")
        .attr("x1", 0)
        .attr("y1", yV)
        .attr("x2", width)
        .attr("y2", yV);
      svg
        .append("line")
        .attr("class", "tempY")
        .attr("x1", xV)
        .attr("y1", 0)
        .attr("x2", xV)
        .attr("y2", height);
      svg
        .append("text")
        .attr("class", "tempY")
        .attr("x", xV - 55)
        .attr("y", height + 30)
        .text(x.toString().split("GMT")[0]);
      // svg
      //   .append("text")
      //   .attr("class", "tempX")
      //   .attr("x", width + 6)
      //   .attr("y", yV + 3)
      //   .text(that.formatYVal(y));
      createYAxisText({
        id: `tempXText`,
        className: "tempX",
        text: that.formatYVal(y),
        y: yV + 3,
      });
    }

    function closeTT() {
      svg.selectAll([".tempX", ".tempY"]).remove();
      let el = document.getElementById("tooltipData");
      el.style.display = "none";
      el.innerHTML = "";
      that.setState({ isHovering: undefined });
    }

    if (isHovering && isHovering.symbol === symbol) {
      hoverBar(isHovering.i, isHovering.d);
      showTempHoverLines(
        isHovering.xV,
        isHovering.yV,
        isHovering.xA,
        isHovering.yA
      );
    }

    svg
      .append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).tickSize(-width).tickFormat(""));

    if (myBuyPrice && myBuyPrice[symbol]) {
      svg
        .append("rect")
        .attr("class", "break-even")
        .attr("width", width)
        .attr("height", 1)
        .attr("y", y(breakEven));

      svg
        .append("text")
        .attr("class", "break-even")
        .attr("x", 0)
        .attr("y", y(breakEven))
        .style("font-size", "12px")
        .text(`Break Even: $${this.formatYVal(breakEven, 2)}`);

      svg
        .append("line")
        .attr("class", "my-buy")
        .attr("x1", 0)
        .attr("y1", y(myBuyPrice[symbol]))
        .attr("x2", width)
        .attr("y2", y(myBuyPrice[symbol]));
      svg
        .append("line")
        .attr("class", "my-buy")
        .attr("x1", x(myBuyTime[symbol]) - 2)
        .attr("y1", 0)
        .attr("x2", x(myBuyTime[symbol]) - 2)
        .attr("y2", height);
      svg
        .append("circle")
        .attr("r", 4)
        .attr("class", "my-buy")
        .style("opacity", 0.8)
        .attr("cx", x(myBuyTime[symbol]) - 2)
        .attr("cy", y(myBuyPrice[symbol]));

      svg
        .append("text")
        .attr("class", "break-even")
        .attr("x", Math.max(x(myBuyTime[symbol]) + 1, 0))
        .attr("y", y(myBuyPrice[symbol]) + 13)
        .style("font-size", "12px")
        .text(
          `${myBuyQuantity[symbol]} @ $${this.formatYVal(
            myBuyPrice[symbol],
            2
          )} (${new Date(myBuyTime[symbol]).toLocaleString().split(", ")[1]})`
        );

      //   svg
      //     .append("text")
      //     .attr("class", "break-even")
      //     .attr("x", width + 4)
      //     .attr("y", )
      //     .style("font-size", "12px")
      //     .style("font-weigth", "bold")
      //     .text();
      createYAxisText({
        id: `${symbol}_breakEven`,
        className: "break-even",
        fs: "12px",
        fw: "bold",
        text: `$${that.formatYVal(currentProfit, 2)}`,
        y: y(currentPrices[symbol].v) + 13,
      });
    }
    // svg
    //   .append("rect")
    //   .attr("class", "break-even")
    //   .attr("width", width)
    //   .attr("height", 1)
    //   .attr("y", y(targetSellPrice));

    // svg
    //   .append("text")
    //   .attr("class", "break-even")
    //   .attr("x", 0)
    //   .attr("y", y(targetSellPrice))
    //   .style("font-size", "12px")
    //   .text(`Target Sell Price: $${this.formatYVal(targetSellPrice, 2)}`);

    function createYAxisText({ id, className, fs, fw, fill, text, y }) {
      function createText({ id, className, fs, fw, fill, text, y }) {
        svg
          .append("text")
          .attr("class", className)
          .attr("id", id)
          .attr("x", width + 4)
          .attr("y", y)
          .style("font-size", fs)
          .style("font-weight", fw)
          .attr("fill", fill)
          .text(text);

        var ctx = document.querySelector(`#${symbol} svg`),
          textElm = ctx.getElementById(id),
          SVGRect = textElm.getBBox();
        return SVGRect;
      }
      let SVGRect = createText({ id, className, fs, fw, fill, text, y });
      svg
        .append("rect")
        .attr("id", `${id}_background`)
        .attr("x", SVGRect.x)
        .attr("y", SVGRect.y)
        .attr("width", SVGRect.width)
        .attr("height", SVGRect.height)
        .attr("fill", "#191919");
      document.getElementById(id).remove();
      createText({ id, className, fs, fw, fill, text, y });
    }
    let lastBar = data[data.length - 1].data;
    if (currentPrices)
      createYAxisText({
        id: `${symbol}_currentPriceSVG`,
        fs: "12px",
        fw: "bold",
        fill: lastBar[openK] > lastBar[closeK] ? "#fd6838" : "#77e15e",
        text: `$${that.formatYVal(currentPrices[symbol].v)}`,
        y: y(currentPrices[symbol].v),
      });

    if (lookupType == "stock") {
      data.forEach((d, i) => {
        let prevPrev = data[i - 2];
        let prev = data[i - 1];
        let next = data[i + 1];
        if (prev && next && prevPrev) {
          let now = new Date(d.date).getTime();
          let p = new Date(prev.date).getTime();
          let n = new Date(next.date).getTime();
          let pp = new Date(prevPrev.date).getTime();
          let nowDiffNext = Math.abs(now - p) != Math.abs(now - n);
          let nowDiffPrev = Math.abs(now - p) != Math.abs(pp - p);
          let isDiff = nowDiffNext && nowDiffPrev;
          if (isDiff) {
            drawVertLine(x(d.date) - 0.5);
          }
        }
      });
    } else if (this.state.realtimeResults && livePriceInterval != 24 * 60) {
      let now = new Date();
      let startOfToday = new Date(
        `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} 00:00:00`
      );
      while (startOfToday.getTime() > firstDate) {
        drawVertLine(x(startOfToday.getTime()) - 0.5);
        startOfToday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
      }
    }
    function drawVertLine(xV) {
      svg
        .append("g")
        .attr("class", "grid")
        .append("line")
        .attr("x1", xV)
        .attr("y1", 0)
        .attr("x2", xV)
        .attr("y2", height)
        .attr("stroke", "lightgray");
    }
    // svg
    //   .append("path")
    //   .datum(data)
    //   .attr("fill", "none")
    //   .attr("stroke", "steelblue")
    //   .attr("stroke-width", 1.5)
    //   .attr(
    //     "d",
    //     d3
    //       .line()
    //       .x(function (d) {
    //         return x(d.date);
    //       })
    //       .y(function (d) {
    //         return y(d.value);
    //       })
    //   );
  }

  formatYVal(y, tf) {
    y = Number(y);
    if (tf === undefined)
      tf = y > 9999 ? 0 : y > 999 ? 1 : y > 99 ? 2 : y > 9 ? 3 : 4;
    y = y.toFixed(tf);
    let parts = y.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }

  showResults() {
    let {
      results,
      view,
      lookupType,
      realtimeResults,
      currentPrices,
    } = this.state;
    // set the dimensions and margins of the graph
    if (realtimeResults) {
      return (
        <div>
          {Object.keys(realtimeResults).map((id) => {
            return (
              <div
                key={id}
                id={id + "_container"}
                style={{
                  height:
                    (window.innerHeight - 50) /
                      Object.keys(realtimeResults).length +
                    "px",
                }}
              >
                {currentPrices && currentPrices[id] ? (
                  <div>
                    <div>
                      <span>Symbol: {id}</span>
                      <span
                        id={`currentPrice_${id}`}
                        style={{
                          margin: "5px",
                          color:
                            currentPrices[id].type == 1 ? "#fd6838" : "#77e15e",
                          fontWeight: "bold",
                        }}
                      >
                        ${this.formatYVal(currentPrices[id].v, 2)}
                      </span>
                    </div>
                    <div className="statsOuter">
                      {["Day", "Hour", "Ten Minutes"].map((t) => {
                        let tID = t.replace(" ", "");
                        tID = tID.charAt(0).toLowerCase() + tID.slice(1);
                        return (
                          <div key={t} className="stats">
                            <div>
                              <span>Last {t}:</span>
                            </div>
                            <div>
                              <span>High:</span>
                              <span
                                id={`${id}_${tID}High`}
                                style={{ color: "#77e15e" }}
                              ></span>
                            </div>
                            <div>
                              <span>Low:</span>
                              <span
                                id={`${id}_${tID}Low`}
                                style={{ color: "#fd6838" }}
                              ></span>
                            </div>
                            <div>
                              <span>Change:</span>
                              <span id={`${id}_${tID}Change`}></span>
                            </div>
                            <div>
                              <span>Sell:</span>
                              <span
                                id={`${id}_${tID}Sell`}
                                style={{ color: "#fd6838" }}
                              ></span>
                            </div>
                            <div>
                              <span>Buy:</span>
                              <span
                                id={`${id}_${tID}Buy`}
                                style={{ color: "#77e15e" }}
                              ></span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  ""
                )}
                <div id={id}></div>
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <div>
        {results.map((r, i) => {
          let k = Object.keys(r).filter((x) => x != "Meta Data")[0];
          let b = "solid 1px rgba(0,0,0,0.1)";
          let s = { borderRight: b, borderBottom: b };
          let h = Math.max(
            (window.innerHeight - 20) / results.length - 66,
            300
          );
          {
            /* let id = r.ticker; */
          }
          let id =
            lookupType == "stock"
              ? r["Meta Data"]["2. Symbol"]
              : r["Meta Data"]["2. Digital Currency Code"];
          if (id) {
            id = id.toUpperCase();
            return (
              <div key={i}>
                <div style={{ position: "relative" }}>
                  <div>Symbol: {id}</div>
                  <div>{r["Meta Data"]["1. Information"]}</div>
                </div>
                {view == "chart" ? <div id={id}></div> : this.list(r, h)}
              </div>
            );
          } else return "";
        })}
      </div>
    );
  }

  getTimeFromDate(d) {
    return (
      ("0" + d.getHours()).slice(-2) +
      ":" +
      ("0" + d.getMinutes()).slice(-2) +
      ":" +
      ("0" + d.getSeconds()).slice(-2)
    );
  }

  shouldComponentUpdate(nextProps, nextState) {
    let {
      lookupType,
      livePriceInterval,
      realtimeResults,
      barWidth,
      results,
      currentPrices,
      websocket,
      refresh,
    } = this.state;

    if (
      refresh !== nextState.refresh ||
      websocket !== nextState.websocket ||
      currentPrices !== nextState.currentPrices ||
      results !== nextState.results ||
      barWidth !== nextState.barWidth ||
      lookupType !== nextState.lookupType ||
      livePriceInterval !== nextState.livePriceInterval ||
      (!realtimeResults && nextState.realtimeResults) ||
      !equal(
        Object.keys(realtimeResults),
        Object.keys(nextState.realtimeResults)
      )
    )
      return true;
    else return false;
  }

  compare() {
    let btc = document.getElementById("BTC");
    let btcTop = btc.getBoundingClientRect().top;
    let eth = document.getElementById("ETH");
    let ethTop = eth.getBoundingClientRect().top;
    eth.style.transform = `translateY(-${ethTop - btcTop}px)`;
  }

  render() {
    let { realtimeResults } = this.state;
    let now = new Date().getTime();
    return (
      <div className="main-body">
        <div>
          <h2>Lookup Stocks</h2>
          {this.inputs()}
          {this.buttons()}
          <div id="compareButton" onClick={this.compare}>
            Compare
          </div>
          <div id="tooltipData"></div>
          <div id="liveTradesContainer">
            {realtimeResults
              ? Object.keys(realtimeResults).map((k) => {
                  return (
                    <div key={k} id={`liveTrades_${k}`}>
                      <div>{k}</div>
                      <div className="headers">
                        <div>Time</div>
                        <div>Price</div>
                        <div>Volume</div>
                      </div>
                      <React.Fragment>
                        {[...realtimeResults[k]]
                          .sort((a, b) => b.t - a.t)
                          .filter((d, i) => i < 100)
                          .map((d, i) => {
                            return (
                              <div
                                key={i}
                                className={`${d.type == 1 ? "sell" : "buy"} ${
                                  d.isNew ? "isNew" : ""
                                }`}
                              >
                                <div className="timestamp">
                                  {this.getTimeFromDate(new Date(d.t))}
                                </div>
                                <div className="price">
                                  ${this.formatYVal(d.v, 2)}
                                </div>
                                <div className="amount">{d.vol}</div>
                              </div>
                            );
                          })}
                      </React.Fragment>
                    </div>
                  );
                })
              : ""}
          </div>
        </div>
        <div
          style={{
            maxHeight: "calc(100vh - 20px)",
            overflow: "auto",
          }}
        >
          {this.showResults()}
        </div>
      </div>
    );
  }
}
export default App;
