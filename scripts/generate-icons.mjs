// Rasterize the master app icon into the PWA / favicon PNG set.
// Run after editing public/icons/app-icon.svg:  npm run icons
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(here, '..', 'public', 'icons')
const svg = readFileSync(join(iconsDir, 'app-icon.svg'))

const targets = [
  { size: 64, name: 'pwa-64.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'pwa-192.png' },
  { size: 512, name: 'pwa-512.png' },
  { size: 512, name: 'pwa-maskable-512.png' },
]

for (const { size, name } of targets) {
  // density renders the SVG crisply before downscaling to the target box
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(join(iconsDir, name))
  console.log(`wrote icons/${name} (${size}x${size})`)
}
