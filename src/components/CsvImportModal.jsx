import { useState } from 'react'
import Modal from './ui/Modal'
import { Button } from './ui/Button'
import { useAddLeads } from '../hooks/useLeads'

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const idx = {
    facility_name: header.indexOf('facility_name'),
    contact_name: header.indexOf('contact_name'),
    phone: header.indexOf('phone'),
    notes: header.indexOf('notes'),
  }
  if (idx.facility_name === -1) return []

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim())
    return {
      facility_name: cols[idx.facility_name] || '',
      contact_name: idx.contact_name >= 0 ? cols[idx.contact_name] || null : null,
      phone: idx.phone >= 0 ? cols[idx.phone] || null : null,
      notes: idx.notes >= 0 ? cols[idx.notes] || null : null,
    }
  }).filter((r) => r.facility_name)
}

export default function CsvImportModal({ onClose }) {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const addLeads = useAddLeads()

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    const text = await file.text()
    const parsed = parseCsv(text)
    if (!parsed.length) {
      setError('No rows found — first column must be "facility_name". Optional columns: contact_name, phone, notes.')
    }
    setRows(parsed)
  }

  async function handleImport() {
    await addLeads.mutateAsync(rows)
    onClose()
  }

  return (
    <Modal title="Import leads from CSV" onClose={onClose} width="max-w-lg">
      <div className="space-y-4">
        <p className="font-sans text-sm text-fg-secondary">
          CSV header row: <code className="font-mono text-xs">facility_name,contact_name,phone,notes</code>
        </p>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="w-full font-sans text-sm text-fg-secondary file:mr-4 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:font-sans file:text-sm file:font-semibold file:text-white"
        />

        {error && <p className="font-sans text-sm text-danger">{error}</p>}

        {rows.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-line">
            <table className="w-full text-left font-sans text-sm">
              <thead className="eyebrow bg-surface">
                <tr>
                  <th className="px-3 py-2">Facility</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Phone</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-3 py-2">{r.facility_name}</td>
                    <td className="px-3 py-2 text-fg-secondary">{r.contact_name || '—'}</td>
                    <td className="px-3 py-2 text-fg-secondary">{r.phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <span className="font-sans text-xs text-fg-faint">{fileName && `${rows.length} row(s) parsed`}</span>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!rows.length || addLeads.isPending}>
              {addLeads.isPending ? 'Importing…' : `Import ${rows.length || ''}`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
