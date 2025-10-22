const express = require('express');
const verify = require('./middleware/verifyTelegramInitData.cjs');
const app = express();
const BOT_TOKEN = process.env.BOT_TOKEN || '8259683688:AAHx3AuA1LqiPjujBceaf6dHytuv7M2fxEo';
app.get(['/','/webapp'], verify(BOT_TOKEN), (req, res) => {
  res.setHeader('content-type','text/plain');
  res.end('ok\n' + (req.telegramInit ? req.telegramInit.data_check_string : 'no-data'));
});
app.use((req,res)=>res.status(404).send('not found'));
app.listen(3001, ()=>console.log('verify server listening on :3001'));
