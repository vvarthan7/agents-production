import 'dotenv/config'
import { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname } from 'path'
import { readdir } from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const main = async () => {
  console.log('Eval runner starting...')
  const evalName = process.argv[2]
  const experimentsDir = join(__dirname, 'experiments')

  try {
    if (evalName) {
      const evalPath = join(experimentsDir, `${evalName}.eval.ts`)
      await import(pathToFileURL(evalPath).href)
    } else {
      const files = await readdir(experimentsDir)
      const evalFiles = files.filter((file) => file.endsWith('.eval.ts'))

      for (const evalFile of evalFiles) {
        const evalPath = join(experimentsDir, evalFile)
        await import(pathToFileURL(evalPath).href)
      }
    }
  } catch (error) {
    console.error(
      `Failed to run eval${evalName ? ` '${evalName}'` : 's'}:`,
      error,
    )
    process.exit(1)
  }
}

main()
