import XLSX from 'xlsx'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const filePath = path.join(__dirname, '..', 'public', 'inventarios', 'leon', 'LEON 27 ABRIL.xlsx')
const wb = XLSX.readFile(filePath)

console.log('Hojas:', wb.SheetNames)

for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName]
  const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
  if (json.length === 0) { console.log(`Hoja "${sheetName}": vacía`); continue }
  console.log(`\nHoja: "${sheetName}" — ${json.length} filas`)
  console.log('Columnas:', JSON.stringify(Object.keys(json[0])))
  console.log('Fila 1:', JSON.stringify(json[0]))
  console.log('Fila 2:', JSON.stringify(json[1] ?? {}))
  console.log('Fila 3:', JSON.stringify(json[2] ?? {}))
}
