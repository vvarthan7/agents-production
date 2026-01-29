import 'dotenv/config'
import http from 'http'
import { runAgentChat, getMessageHistory, clearHistory } from './chatAgent'
import { tools } from '../src/tools'

const PORT = process.env.PORT || 3001

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const parseBody = (req: http.IncomingMessage): Promise<any> => {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk.toString()))
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

const sendJSON = (
  res: http.ServerResponse,
  status: number,
  data: any
): void => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...corsHeaders,
  })
  res.end(JSON.stringify(data))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders)
    res.end()
    return
  }

  try {
    // POST /api/chat - Send a message to the agent
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      const { message } = await parseBody(req)

      if (!message || typeof message !== 'string') {
        sendJSON(res, 400, { error: 'Message is required' })
        return
      }

      console.log(`[Chat] User: ${message}`)
      const response = await runAgentChat({ userMessage: message, tools })
      console.log(`[Chat] Assistant: ${response.content}`)

      sendJSON(res, 200, {
        success: true,
        message: response,
      })
      return
    }

    // GET /api/messages - Get message history
    if (url.pathname === '/api/messages' && req.method === 'GET') {
      const messages = await getMessageHistory()
      sendJSON(res, 200, { messages })
      return
    }

    // DELETE /api/messages - Clear message history
    if (url.pathname === '/api/messages' && req.method === 'DELETE') {
      await clearHistory()
      sendJSON(res, 200, { success: true })
      return
    }

    // Health check
    if (url.pathname === '/api/health' && req.method === 'GET') {
      sendJSON(res, 200, { status: 'ok', timestamp: new Date().toISOString() })
      return
    }

    // 404 for unknown routes
    sendJSON(res, 404, { error: 'Not found' })
  } catch (error) {
    console.error('Server error:', error)
    sendJSON(res, 500, {
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

server.listen(PORT, () => {
  console.log(`
  ========================================
    Chat API Server running on port ${PORT}
  ========================================

  Endpoints:
    POST /api/chat      - Send a message
    GET  /api/messages  - Get chat history
    DELETE /api/messages - Clear chat history
    GET  /api/health    - Health check

  `)
})
