import type { AIMessage } from '../types'
import { JSONFilePreset } from 'lowdb/node'
import { v4 as uuidv4 } from 'uuid'
import { openai } from '../src/ai'
import { zodFunction } from 'openai/helpers/zod'
import { systemPrompt } from '../src/systemPrompt'
import { runTool } from '../src/toolRunner'
import { generateImageToolDefinition } from '../src/tools/generateImage'

// Types
type MessageWithMetadata = AIMessage & {
  id: string
  createdAt: string
}

type ChatData = {
  messages: MessageWithMetadata[]
  summary: string
}

// Response type for the chat API
export interface ChatResponse {
  role: 'assistant'
  content: string
  toolCalls?: {
    name: string
    result: string
  }[]
  needsApproval?: boolean
  approvalFor?: string
}

const defaultData: ChatData = {
  messages: [],
  summary: '',
}

// Database helpers
const getDb = async () => {
  const db = await JSONFilePreset<ChatData>('chat-db.json', defaultData)
  return db
}

const addMetadata = (message: AIMessage): MessageWithMetadata => ({
  ...message,
  id: uuidv4(),
  createdAt: new Date().toISOString(),
})

const removeMetadata = (message: MessageWithMetadata): AIMessage => {
  const { id, createdAt, ...rest } = message
  return rest as AIMessage
}

// Memory management
const addMessages = async (messages: AIMessage[]) => {
  const db = await getDb()
  db.data.messages.push(...messages.map(addMetadata))

  // Summarize when we have too many messages
  if (db.data.messages.length >= 10) {
    const oldestMessages = db.data.messages.slice(0, 5).map(removeMetadata)
    db.data.summary = await summarizeMessages(oldestMessages)
    db.data.messages = db.data.messages.slice(5)
  }

  await db.write()
}

const getMessages = async (): Promise<AIMessage[]> => {
  const db = await getDb()
  const messages = db.data.messages.map(removeMetadata)
  const lastFive = messages.slice(-5)

  // If first message is a tool response, include the previous message
  if (lastFive[0]?.role === 'tool') {
    const sixthMessage = messages[messages.length - 6]
    if (sixthMessage) {
      return [sixthMessage, ...lastFive]
    }
  }

  return lastFive
}

const getSummary = async (): Promise<string> => {
  const db = await getDb()
  return db.data.summary
}

const saveToolResponse = async (toolCallId: string, toolResponse: string) => {
  return addMessages([
    {
      role: 'tool',
      content: toolResponse,
      tool_call_id: toolCallId,
    },
  ])
}

// LLM functions
const runLLM = async ({
  messages,
  tools = [],
  temperature = 0.1,
}: {
  messages: AIMessage[]
  tools?: any[]
  temperature?: number
}) => {
  const formattedTools = tools.map(zodFunction)
  const summary = await getSummary()

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature,
    messages: [
      {
        role: 'system',
        content: `${systemPrompt}. Conversation summary so far: ${summary}`,
      },
      ...messages,
    ],
    ...(formattedTools.length > 0 && {
      tools: formattedTools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
    }),
  })

  return response.choices[0].message
}

const summarizeMessages = async (messages: AIMessage[]): Promise<string> => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content:
          'Summarize the key points of the conversation in a concise way that would be helpful as context for future interactions.',
      },
      ...messages,
    ],
  })

  return response.choices[0].message.content || ''
}

// Main chat agent function
export const runAgentChat = async ({
  userMessage,
  tools,
}: {
  userMessage: string
  tools: any[]
}): Promise<ChatResponse> => {
  await addMessages([{ role: 'user', content: userMessage }])

  const toolCallResults: { name: string; result: string }[] = []

  while (true) {
    const history = await getMessages()
    const response = await runLLM({ messages: history, tools })

    await addMessages([response])

    // If we have a text response, we're done
    if (response.content) {
      return {
        role: 'assistant',
        content: response.content,
        toolCalls: toolCallResults.length > 0 ? toolCallResults : undefined,
      }
    }

    // Handle tool calls
    if (response.tool_calls) {
      const toolCall = response.tool_calls[0]

      // Image generation requires approval - return for user confirmation
      if (toolCall.function.name === generateImageToolDefinition.name) {
        return {
          role: 'assistant',
          content: `I'd like to generate an image. Do you approve? (Reply with "yes" to approve)`,
          needsApproval: true,
          approvalFor: 'image_generation',
        }
      }

      // Execute other tools directly
      const toolResponse = await runTool(toolCall, userMessage)
      await saveToolResponse(toolCall.id, toolResponse)

      toolCallResults.push({
        name: toolCall.function.name,
        result: toolResponse,
      })
    }
  }
}

// Get full message history for display
export const getMessageHistory = async (): Promise<
  { role: string; content: string; timestamp: string }[]
> => {
  const db = await getDb()
  return db.data.messages
    .filter((msg) => msg.role === 'user' || (msg.role === 'assistant' && msg.content))
    .map((msg) => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      timestamp: msg.createdAt,
    }))
}

// Clear chat history
export const clearHistory = async (): Promise<void> => {
  const db = await getDb()
  db.data.messages = []
  db.data.summary = ''
  await db.write()
}
