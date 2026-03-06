import { defineCollection } from 'astro:content';
import { notionLoader } from '../lib/notion/loader';

const posts = defineCollection({
    loader: notionLoader({
        databaseId: import.meta.env.NOTION_DATABASE_ID,
        filter: { property: 'Status', select: { equals: 'Test' } }, // initially only Test
    }),
});

export const collections = { posts };
