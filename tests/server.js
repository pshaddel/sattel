const express = require("express");
const app = express();
const port = 4002;
const logger = { logHeaders: (req) => { console.log("Request Headers:", req.headers); } };

function sampleMiddleware(req, res, next) { logger.logHeaders(req); next(); }
app.use(sampleMiddleware);
app.get("/", (req, res) => {
	res.send("Hello World!");
});

app.listen(port, () => {
	console.log(`Server is running at http://localhost:${port}`);
});
