// server.js
const express = require('express')
const path    = require('path')
const verifyTelegramInitData = require('./middleware/verifyTelegramInitData.cjs')
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || ''

const app = express()

// 1. Inject ngrok header on every response
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true')
  next()
})

app.get('/webapp', verifyTelegramInitData(BOT_TOKEN), (req, res, next) => next())
app.get('/', verifyTelegramInitData(BOT_TOKEN), (req, res, next) => next())

// 2. Serve static assets from React’s build folder
const buildPath = path.join(__dirname, 'build')
app.use(express.static(buildPath))

// 3. Always return index.html for any route
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'))
})

// 4. Start the server
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
