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

export async function fetchPublishedPosts() {
    return limit(async () => {
        const response = await notion.databases.query({
            database_id: DATABASE_ID!,
            filter: {
                property: 'Status',
                select: { equals: 'Published' },
            },
            sorts: [
                { property: 'Created time', direction: 'descending' },
            ],
        });
        return response.results;
    });
}

export async function fetchBlockChildren(blockId: string) {
    return limit(async () => {
        const blocks: any[] = [];
        let cursor: string | undefined;
        do {
            const response = await notion.blocks.children.list({
                block_id: blockId,
                start_cursor: cursor,
            });
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
    });
}
