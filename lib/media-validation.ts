import { get } from '@vercel/blob'

const VIDEO_DURATION_LIMIT_SECONDS = 60

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'video/mp4' | 'video/webm'

function readVint(bytes: Buffer, offset: number) {
  const first = bytes[offset]
  if (first === undefined || first === 0) return null
  let mask = 0x80
  let length = 1
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1
    length += 1
  }
  if (length > 8 || offset + length > bytes.length) return null
  let value = BigInt(first & (mask - 1))
  for (let index = 1; index < length; index += 1) value = (value << BigInt(8)) | BigInt(bytes[offset + index])
  return { length, value: Number(value) }
}

function parseWebmDurationSeconds(bytes: Buffer) {
  let timecodeScaleNs = 1_000_000
  let durationSeconds: number | null = null

  for (let index = 0; index < bytes.length - 4; index += 1) {
    if (bytes[index] === 0x2a && bytes[index + 1] === 0xd7 && bytes[index + 2] === 0xb1) {
      const size = readVint(bytes, index + 3)
      if (size && size.value > 0 && size.value <= 8 && index + 3 + size.length + size.value <= bytes.length) {
        let scale = 0
        for (let cursor = 0; cursor < size.value; cursor += 1) scale = scale * 256 + bytes[index + 3 + size.length + cursor]
        if (Number.isSafeInteger(scale) && scale > 0) timecodeScaleNs = scale
      }
    }
    if (bytes[index] === 0x44 && bytes[index + 1] === 0x89) {
      const size = readVint(bytes, index + 2)
      if (size && (size.value === 4 || size.value === 8) && index + 2 + size.length + size.value <= bytes.length) {
        const start = index + 2 + size.length
        const duration = size.value === 4 ? bytes.readFloatBE(start) : bytes.readDoubleBE(start)
        if (Number.isFinite(duration) && duration >= 0) durationSeconds = (duration * timecodeScaleNs) / 1_000_000_000
      }
    }
  }
  return durationSeconds
}

function parseMp4DurationSeconds(bytes: Buffer) {
  const marker = Buffer.from('mvhd')
  const offset = bytes.indexOf(marker)
  if (offset < 0 || offset + 24 > bytes.length) return null
  const version = bytes[offset + 4]
  if (version === 0) {
    const timescale = bytes.readUInt32BE(offset + 16)
    const duration = bytes.readUInt32BE(offset + 20)
    return timescale > 0 ? duration / timescale : null
  }
  if (version === 1 && offset + 36 <= bytes.length) {
    const timescale = bytes.readUInt32BE(offset + 24)
    const duration = Number(bytes.readBigUInt64BE(offset + 28))
    return timescale > 0 && Number.isFinite(duration) ? duration / timescale : null
  }
  return null
}

function matchesMediaSignature(type: MediaType, bytes: Buffer) {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (type === 'image/webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  if (type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))
  if (type === 'video/mp4') return bytes.subarray(4, 8).toString('ascii') === 'ftyp'
  return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
}

async function readBlobBytes(pathname: string, maximumSizeInBytes: number) {
  const result = await get(pathname, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) throw new Error('uploaded_blob_unavailable')

  const reader = result.stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maximumSizeInBytes) {
        await reader.cancel()
        throw new Error('uploaded_blob_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total)
}

export async function validateUploadedMedia({ pathname, contentType, maximumSizeInBytes, maximumDurationSeconds }: {
  pathname: string
  contentType: string
  maximumSizeInBytes: number
  maximumDurationSeconds?: number
}) {
  const bytes = await readBlobBytes(pathname, maximumSizeInBytes)
  if (!matchesMediaSignature(contentType as MediaType, bytes)) throw new Error('uploaded_blob_signature_mismatch')

  if (maximumDurationSeconds !== undefined) {
    const durationSeconds = contentType === 'video/mp4' ? parseMp4DurationSeconds(bytes)
      : contentType === 'video/webm' ? parseWebmDurationSeconds(bytes)
        : null
    if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > Math.min(maximumDurationSeconds, VIDEO_DURATION_LIMIT_SECONDS)) {
      throw new Error('uploaded_video_duration_invalid')
    }
  }
}
