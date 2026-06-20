import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadZone } from '@/components/upload/UploadZone'
import { UploadForm } from '@/components/upload/UploadForm'

describe('UploadZone', () => {
  it('shows label and placeholder when no file selected', () => {
    render(<UploadZone label="Pre-Afet Görüntüsü" file={null} onFile={jest.fn()} />)
    expect(screen.getByText('Pre-Afet Görüntüsü')).toBeInTheDocument()
    expect(screen.getByText(/.tif/i)).toBeInTheDocument()
  })

  it('calls onFile when a file is dropped', () => {
    const onFile = jest.fn()
    render(<UploadZone label="Pre-Afet Görüntüsü" file={null} onFile={onFile} />)
    const file = new File(['data'], 'test.tif', { type: 'image/tiff' })
    const dropZone = screen.getByRole('button')
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })
    expect(onFile).toHaveBeenCalledWith(file)
  })
})

describe('UploadForm', () => {
  it('submit button is disabled when no files selected', () => {
    render(<UploadForm onStart={jest.fn()} />)
    const btn = screen.getByRole('button', { name: /TIFF/i })
    expect(btn).toBeDisabled()
  })
})
