const express = require("express");
const app = express();
const port = 4002;

function logHeaders(headers) {
	console.log("Headers:", headers);
}

function logger(req, res, next) {
	logHeaders(req.headers);
	next();
}

app.use(logger);

app.get("/", (req, res) => {
	res.send("Hello World!");
});

app.listen(port, () => {
	console.log(`Server is running at http://localhost:${port}`);
});

module.exports = { app, port, logger, logHeaders };
