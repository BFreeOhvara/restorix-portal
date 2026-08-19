import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'
import Modal from './Modal'
import { Button } from './Button'
import { cropImageToBlob } from '../../lib/imageCrop'

// Prompt 491 — ported from ohvara-dashboard's Prompt 422: a crop/zoom step
// between file-select and upload, so a picked photo doesn't land off-center
// or stretched into the circle. Reuses this project's own Modal rather than
// Ohvara's bespoke portal/overlay, for consistency with every other modal
// in this codebase.
export function AvatarCropModal({ imageSrc, onCancel, onConfirm, saving }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const onCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels)
  }, [])

  async function confirm() {
    if (!croppedAreaPixels) return
    const blob = await cropImageToBlob(imageSrc, croppedAreaPixels)
    onConfirm(blob)
  }

  return (
    <Modal title="Position your photo" onClose={onCancel} width="max-w-md">
      <div className="relative h-72 w-full overflow-hidden rounded-lg bg-base">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <input
        type="range"
        min={1}
        max={3}
        step={0.01}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        className="mt-4 w-full accent-accent"
      />

      <div className="mt-5 flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={confirm} disabled={saving || !croppedAreaPixels}>
          {saving ? 'Uploading…' : 'Save photo'}
        </Button>
      </div>
    </Modal>
  )
}
