import type { Loader } from 'astro/content';
import { notion, fetchBlockChildren } from './client';
import { downloadImage } from './images';

export function notionLoader(options: {
    databaseId: string;
    filter?: any;
}): Loader {
    return {
        name: 'notion-loader',
        async load({ store, logger }) {
            logger.info('Fetching Notion DB...');

            const response = await notion.databases.query({
                database_id: options.databaseId,
                filter: options.filter,
            });

            for (const page of response.results) {
                if (!('properties' in page)) continue;

                const slug = extractText(page.properties.Slug);
                const lastEdited = page.last_edited_time;

                const existing = store.get(slug);
                if (existing?.data?.lastEdited === lastEdited) {
                    logger.info(`Skip (unchanged): ${slug}`);
                    continue;
                }

                logger.info(`Fetching blocks for: ${slug}`);
                const blocks = await fetchBlockChildren(page.id);

                let leadImage = null;

                // Extract cover image from the top-most block
                if (blocks.length > 0 && blocks[0].type === 'image') {
                    const block = blocks[0];
                    if (block.image?.file?.url || block.image?.external?.url) {
                        const url = block.image?.file?.url || block.image?.external?.url;
                        block.image.localPath = await downloadImage(url);
                        leadImage = block.image.localPath;
                        blocks.shift(); // Remove it from the body blocks so it doesn't render twice
                    }
                }

                // Still need to cache any remaining images in the body
                for (const block of blocks) {
                    if (block.type === 'image' && (block.image?.file?.url || block.image?.external?.url)) {
                        const url = block.image?.file?.url || block.image?.external?.url;
                        block.image.localPath = await downloadImage(url);
                    }
                }

                // Apply fallback if no lead image found
                if (!leadImage) {
                    leadImage = '/favicon.png';
                }

                const isPrivate = Boolean(page.properties.IsPrivate?.checkbox ?? false);

                store.set({
                    id: slug,
                    data: {
                        title: extractText(page.properties.Name),
                        slug,
                        description: extractText(page.properties.Description),
                        tags: extractMultiSelect(page.properties.Tags),
                        isPrivate,
                        createdTime: page.created_time,
                        lastEdited,
                        leadImage,
                        blocks,
                    },
                });
            }
        },
    };
}

function extractText(property: any): string {
    if (!property) return '';
    if (property.type === 'title') {
        return property.title.map((t: any) => t.plain_text).join('');
    }
    if (property.type === 'rich_text') {
        return property.rich_text.map((t: any) => t.plain_text).join('');
    }
    return '';
}

function extractMultiSelect(property: any): string[] {
    if (property?.type === 'multi_select') {
        return property.multi_select.map((s: any) => s.name);
    }
    return [];
}
