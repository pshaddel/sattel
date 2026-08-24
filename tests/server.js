const express = require("express");
const app = express();
const port = 4002;\n\nfunction logHeaders(req) {\n\tconsole.log("Headers:", req.headers);\n\treturn req.headers;\n}\n\nfunction logger(req, res, next) {\n\tconsole.log(`${req.method} ${req.url}`);\n\tlogHeaders(req);\n\tnext();\n}\n\n

app.use(logger);

app.get("/", (req, res) => {
	res.send("Hello World!");
});

app.listen(port, () => {
	console.log(`Server is running at http://localhost:${port}`);
});

module.exports = { app, port, logger, logHeaders };
