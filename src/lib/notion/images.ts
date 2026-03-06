import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CACHE_DIR = '.astro/notion-cache/images'; // Persistent cache
const PUBLIC_DIR = 'public/notion-images';      // Served by Astro

export async function downloadImage(url: string): Promise<string> {
    const hash = crypto.createHash('md5').update(url.split('?')[0]).digest('hex');
    const ext = guessExtension(url);
    const filename = `${hash}.${ext}`;
    const cachePath = path.join(CACHE_DIR, filename);
    const publicPath = path.join(PUBLIC_DIR, filename);

    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    if (!fs.existsSync(PUBLIC_DIR)) {
        // Also create public output dir if not exists
        fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    }

    // 1. Download to Persistent Cache if not exists
    if (!fs.existsSync(cachePath)) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(cachePath, buffer);
    }

    // 2. Synchronize to public directory for serving/building
    if (!fs.existsSync(publicPath)) {
        fs.copyFileSync(cachePath, publicPath);
    }

    return `/notion-images/${filename}`;
}

function guessExtension(url: string): string {
    try {
        const pathname = new URL(url).pathname;
        const ext = path.extname(pathname).slice(1);
        return ext || 'jpg'; // Fallback to jpg
    } catch {
        return 'jpg';
    }
}
