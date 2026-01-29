import { useState, useEffect, useRef, FormEvent } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  toolCalls?: { name: string; result: string }[]
  timestamp: Date
}

interface ApiResponse {
  success: boolean
  message: {
    role: 'assistant'
    content: string
    toolCalls?: { name: string; result: string }[]
    needsApproval?: boolean
    approvalFor?: string
  }
  error?: string
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      const response = await fetch('/api/messages')
      const data = await response.json()
      if (data.messages) {
        setMessages(
          data.messages.map((msg: { role: string; content: string; timestamp: string }) => ({
            id: crypto.randomUUID(),
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: new Date(msg.timestamp),
          }))
        )
      }
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content }),
      })

      const data: ApiResponse = await response.json()

      if (data.success && data.message) {
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.message.content,
          toolCalls: data.message.toolCalls,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMessage])
      } else {
        throw new Error(data.error || 'Failed to get response')
      }
    } catch (error) {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'error',
        content: error instanceof Error ? error.message : 'Something went wrong',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = async () => {
    try {
      await fetch('/api/messages', { method: 'DELETE' })
      setMessages([])
    } catch (error) {
      console.error('Failed to clear history:', error)
    }
  }

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>
          <span className="status-indicator"></span>
          AI Chat Agent
        </h1>
        <button className="clear-btn" onClick={handleClear}>
          Clear Chat
        </button>
      </header>

      <div className="messages-container">
        {messages.length === 0 && (
          <div className="welcome-message">
            <h2>Welcome!</h2>
            <p>
              Start a conversation with the AI agent. You can ask for jokes,
              search for movies, get Reddit posts, or generate images.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div>{message.content}</div>
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="tool-badge">
                Used: {message.toolCalls.map((t) => t.name).join(', ')}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <form className="input-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="message-input"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button type="submit" className="send-btn" disabled={isLoading || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

export default App
