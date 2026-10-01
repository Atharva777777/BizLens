'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { FileRecord } from '@/lib/types/file'
import { apiFiles } from '@/lib/api/files'
import { UploadZone } from '@/components/app/upload-zone'
import { FileTable } from '@/components/app/file-table'

export default function FilesPage() {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [lastUploadedId, setLastUploadedId] = useState<string | null>(null)

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const records = await apiFiles.listFiles()
        const sorted = records.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setFiles(sorted)
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Failed to load files.')
      } finally {
        setIsLoading(false)
      }
    }
    fetchFiles()
  }, [])

  const handleUpload = async (file: File) => {
    setIsUploading(true)
    setLastUploadedId(null)
    try {
      const record = await apiFiles.uploadFile(file)
      setFiles(prev => [record, ...prev])
      setLastUploadedId(record.id)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleteError(null)
    if (lastUploadedId === id) setLastUploadedId(null)
    try {
      await apiFiles.deleteFile(id)
      setFiles(prev => prev.filter(f => f.id !== id))
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete file.')
    }
  }

  // Find the just-uploaded file (if completed, prompt the next step)
  const justUploaded = lastUploadedId ? files.find(f => f.id === lastUploadedId) : null

  return (
    <div className="max-w-4xl animate-in fade-in duration-500">
      <div className="mb-6">
        <h2 className="text-2xl font-serif tracking-tight text-foreground">Files</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload datasets to begin. BizLens processes each file and extracts verifiable financial facts.
        </p>
      </div>

      <div className="space-y-5">
        <UploadZone onUpload={handleUpload} isUploading={isUploading} />

        {/* Post-upload CTA */}
        {justUploaded && justUploaded.status === 'COMPLETED' && (
          <div className="flex items-center justify-between rounded-xl border border-success/20 bg-success/5 px-5 py-3.5">
            <div>
              <p className="text-sm font-medium text-success">Dataset uploaded and processed</p>
              <p className="text-xs text-muted-foreground mt-0.5">{justUploaded.original_filename} is ready for analysis</p>
            </div>
            <Link
              href={`/dashboard/analytics/${justUploaded.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-success hover:underline whitespace-nowrap"
            >
              Analyze dataset <ArrowRight className="size-4" />
            </Link>
          </div>
        )}

        {deleteError && (
          <div className="flex items-center gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger border border-danger/20">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {deleteError}
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <FileTable
            files={files}
            isLoading={isLoading}
            fetchError={fetchError}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  )
}
