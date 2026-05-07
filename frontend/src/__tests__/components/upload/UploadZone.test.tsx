import { render, screen } from '@testing-library/react'
import { UploadZone } from '@/components/upload/UploadZone'

jest.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getRootProps: () => ({ onClick: jest.fn() }),
    getInputProps: () => ({ accept: '.tif,.tiff' }),
    isDragActive: false,
  }),
}))

describe('UploadZone', () => {
  it('renders label', () => {
    render(<UploadZone label="Pre-afet görüntü" file={null} onFile={jest.fn()} />)
    expect(screen.getByText('Pre-afet görüntü')).toBeInTheDocument()
  })

  it('shows filename when file is selected', () => {
    const file = new File([''], 'before.tif', { type: 'image/tiff' })
    render(<UploadZone label="Pre-afet görüntü" file={file} onFile={jest.fn()} />)
    expect(screen.getByText('before.tif')).toBeInTheDocument()
  })

  it('shows drag hint when no file', () => {
    render(<UploadZone label="Pre-afet görüntü" file={null} onFile={jest.fn()} />)
    expect(screen.getByText(/.tif/i)).toBeInTheDocument()
  })
})
