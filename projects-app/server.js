// server.js
const express = require('express')
const path    = require('path')

const app = express()

// 1. Inject ngrok header on every response
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true')
  next()
})

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