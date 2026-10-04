import { Client } from '@notionhq/client';
import pLimit from 'p-limit';

// Astro content layer runs in a Node environment where import.meta.env might not be fully populated immediately
// or without loadEnv. Using standard process.env as fallback.
import { loadEnv } from 'vite';
const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');

export const notion = new Client({
    auth: import.meta.env?.NOTION_API_KEY || env.NOTION_API_KEY,
});

export const DATABASE_ID = import.meta.env?.NOTION_DATABASE_ID || env.NOTION_DATABASE_ID;

// Rate limit: 3 requests per second max. p-limit ensures concurrency is bounded.
const limit = pLimit(2);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let lastRequestTime = 0;
const MIN_INTERVAL_MS = 350; // Ensure <= ~2.8 requests per second

export async function requestWithRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
    return limit(async () => {
        let attempt = 0;
        while (true) {
            const now = Date.now();
            const elapsed = now - lastRequestTime;
            if (elapsed < MIN_INTERVAL_MS) {
                await sleep(MIN_INTERVAL_MS - elapsed);
            }
            lastRequestTime = Date.now();

            try {
                return await fn();
            } catch (err: any) {
                attempt++;
                const isRateLimit = err?.status === 429 || err?.code === 'rate_limited';
                const isServerError = err?.status >= 500 && err?.status < 600;

                if ((isRateLimit || isServerError) && attempt <= maxRetries) {
                    let waitMs = 1000 * Math.pow(2, attempt - 1);
                    const retryAfterHeader = err?.headers?.get?.('retry-after') || err?.headers?.['retry-after'];
                    if (retryAfterHeader) {
                        const parsed = parseInt(retryAfterHeader, 10);
                        if (!isNaN(parsed) && parsed > 0) {
                            waitMs = parsed * 1000;
                        }
                    }
                    console.warn(`[notion-client] ${isRateLimit ? 'Rate limited' : 'Server error'} (${err?.message || err}). Retrying in ${waitMs}ms (attempt ${attempt}/${maxRetries})...`);
                    await sleep(waitMs);
                    continue;
                }
                throw err;
            }
        }
    });
}

export async function queryDatabase(params: Parameters<typeof notion.databases.query>[0]) {
    return requestWithRetry(() => notion.databases.query(params));
}

export async function fetchPublishedPosts() {
    const response = await queryDatabase({
        database_id: DATABASE_ID!,
        filter: {
            property: 'Status',
            select: { equals: 'Published' },
        },
        sorts: [
            { property: 'Last edited time', direction: 'descending' },
        ],
    });
    return response.results;
}

export async function fetchBlockChildren(blockId: string) {
    const blocks: any[] = [];
    let cursor: string | undefined;
    do {
        const response = await requestWithRetry(() => notion.blocks.children.list({
            block_id: blockId,
            start_cursor: cursor,
        }));
        blocks.push(...response.results);
        cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);

    // Recursively fetch children for certain blocks that require it
    for (const block of blocks) {
        if (block.has_children && (block.type === 'table' || block.type === 'column_list' || block.type === 'column')) {
            block[block.type].children = await fetchBlockChildren(block.id);
        }
    }

    return blocks;
}
