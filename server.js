// npm i dotenv
require("dotenv").config();

// npm init -y
// npm i express
const express = require("express");
const app = express();
app.use(express.json());

// npm i axios
const axios = require("axios");

// npm i ioredis
// redis-server
// redis-cli
const Redis = require("ioredis");
const { json } = require("body-parser");
const redisClient = new Redis();

app.post("/bidresponse", async (req, res) => {
  try {
    const { ticker, id, price } = req.body;

    const cnt = await redisClient.incr(`${ticker}-cnt`);

    await redisClient.zadd(
      `${ticker}-bid`,
      price * 10000 - cnt,
      JSON.stringify({ id: id, price: price, order: cnt })
    );

    redisClient
      .multi()
      .zrevrange(`${ticker}-bid`, 0, 0, "WITHSCORES")
      .zrange(`${ticker}-ask`, 0, 0, "WITHSCORES")
      .exec(async (err, results) => {
        if (err) {
          console.error("Redis Error:", err);
          return;
        }

        if (results[0][1].length > 0 && results[1][1].length > 0) {
          const highestBid = JSON.parse(results[0][1][0]);
          const lowestAsk = JSON.parse(results[1][1][0]);

          const highestBidPrice = parseFloat(highestBid.price);
          const lowestAskPrice = parseFloat(lowestAsk.price);

          if (highestBidPrice > lowestAskPrice) {
            try {
              redisClient
                .multi()
                .zrem(`${ticker}-bid`, JSON.stringify(highestBid))
                .zrem(`${ticker}-ask`, JSON.stringify(lowestAsk))
                .exec((err) => {
                  if (err) {
                    console.error("Error executing transaction:", err);
                    return res
                      .status(500)
                      .json({ error: "Error executing transaction." });
                  }
                  return res.json({
                    highestBid: highestBidPrice,
                    lowestAsk: lowestAskPrice,
                  });
                });
            } catch (error) {
              console.error("Error removing highest bid or lowest ask:", error);
              return res
                .status(500)
                .json({ error: "Error removing highest bid or lowest ask." });
            }
          }
        }
        return res.json({ success: "good" });
      });
  } catch (error) {
    console.error("Error in /bidresponse endpoint:", error);
    return res.status(500).json({ error: "Error in /bidresponse endpoint." });
  }
});

// // Get Ask Responses
// app.post("/askresponse/", async (req, res) => {});

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server Listening on PORT ${PORT}`);
});
