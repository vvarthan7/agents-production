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
          data.messages.map(
            (msg: { role: string; content: string; timestamp: string }) => ({
              id: crypto.randomUUID(),
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              timestamp: new Date(msg.timestamp),
            }),
          ),
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
        content:
          error instanceof Error ? error.message : 'Something went wrong',
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
    <div className="w-full max-w-[800px] h-[90vh] max-h-[800px] bg-white/5 backdrop-blur-[10px] rounded-[20px] border border-white/10 flex flex-col overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
      <header className="p-5 px-6 bg-white/8 border-b border-white/10 flex justify-between items-center">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse-custom"></span>
          AI Chat Agent
        </h1>
        <button
          className="px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm cursor-pointer transition-all duration-200 hover:bg-red-500/30 hover:border-red-500/50"
          onClick={handleClear}
        >
          Clear Chat
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="text-center py-10 px-5 text-white/60">
            <h2 className="text-2xl text-white/90 mb-3">Welcome!</h2>
            <p className="text-[0.95rem] leading-relaxed">
              Start a conversation with the AI agent. You can ask for jokes,
              search for movies, get Reddit posts, or generate images.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[80%] px-[18px] py-3.5 rounded-2xl leading-relaxed text-[0.95rem] animate-fade-in break-words ${
              message.role === 'user'
                ? 'self-end bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-[4px]'
                : message.role === 'assistant'
                  ? 'self-start bg-white/10 border border-white/10 rounded-bl-[4px]'
                  : 'self-center bg-red-500/20 border border-red-500/30 text-red-300'
            }`}
          >
            <div>{message.content}</div>
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="inline-block px-2.5 py-1 bg-green-500/20 border border-green-500/30 rounded-md text-xs text-green-300 mt-2">
                Used: {message.toolCalls.map((t) => t.name).join(', ')}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-1 px-[18px] py-3.5 bg-white/10 rounded-2xl rounded-bl-[4px] self-start">
            <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce-typing typing-dot-1"></span>
            <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce-typing typing-dot-2"></span>
            <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce-typing typing-dot-3"></span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-5 bg-white/5 border-t border-white/10">
        <form className="flex gap-3" onSubmit={handleSubmit}>
          <input
            type="text"
            className="flex-1 px-[18px] py-3.5 bg-white/8 border border-white/15 rounded-xl text-white text-[0.95rem] outline-none transition-all duration-200 placeholder:text-white/40 focus:border-blue-500/50 focus:bg-white/10"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="px-6 py-3.5 bg-gradient-to-br from-blue-500 to-blue-600 border-none rounded-xl text-white text-[0.95rem] font-medium cursor-pointer transition-all duration-200 flex items-center gap-2 hover:enabled:-translate-y-0.5 hover:enabled:shadow-[0_4px_12px_rgba(59,130,246,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || !input.trim()}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

export default App
