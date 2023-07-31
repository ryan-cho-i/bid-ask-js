const Redis = require("ioredis");
const redisClient = new Redis();

app.post("/bidresponse", async (req, res) => {
  try {
    const { ticker, id, price } = req.body;
    const cnt = await redisClient.incr(`${ticker}-cnt`);
    await redisClient.zadd(
      `${ticker}-bid`,
      price * 10000 - cnt,
      JSON.stringify({ id, price, order: cnt })
    );

    const multi = redisClient.multi();
    multi.zrange(`${ticker}-asks`, 0, 0, "WITHSCORES");
    multi.zrevrange(`${ticker}-bids`, 0, 0, "WITHSCORES");

    multi.exec(async (err, results) => {
      if (err) {
        console.error("Error executing multi:", err);
        return res.status(500).json({ error: "Error executing multi." });
      }

      const lowestAsk = results[0];
      const highestBid = results[1];

      if (highestBid?.length > 0 && lowestAsk?.length > 0) {
        const highestBidPrice = parseFloat(highestBid[0]);
        const lowestAskPrice = parseFloat(lowestAsk[0]);

        if (highestBidPrice > lowestAskPrice) {
          try {
            await redisClient.zrem(`${ticker}-bids`, highestBid[0]);
            await redisClient.zrem(`${ticker}-asks`, lowestAsk[0]);

            return res.json({
              highestBid: highestBidPrice,
              lowestAsk: lowestAskPrice,
            });
          } catch (error) {
            console.error("Error removing highest bid or lowest ask:", error);
            return res
              .status(500)
              .json({ error: "Error removing highest bid or lowest ask." });
          }
        }
      }
    });
  } catch (error) {
    console.error("Error in /bidresponse endpoint:", error);
    return res.status(500).json({ error: "Error in /bidresponse endpoint." });
  }
});
