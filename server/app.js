const express = require('express');
const path = require('path');

const app = express();

console.log('client path:', path.resolve('client'));

app.use(express.static(path.resolve('client')));

const HTTP_PORT = 3000;

app.listen(HTTP_PORT, () => console.log(`Server running... http://localhost:${HTTP_PORT}`));
