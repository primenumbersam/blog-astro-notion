export default {
    // Cron Trigger (Scheduled sync)
    async scheduled(event, env) {
        const headers = {
            'Authorization': `Bearer ${env.NOTION_API_KEY}`,
            'Notion-Version': '2025-09-03',
            'Content-Type': 'application/json',
        };

        // 1. Resolve Data Source ID from Database ID (2025-09-03 logic)
        let dataSourceId = env.NOTION_DATABASE_ID;
        const dbRes = await fetch(`https://api.notion.com/v1/databases/${env.NOTION_DATABASE_ID}`, { method: 'GET', headers });
        if (dbRes.ok) {
            const dbData = await dbRes.json();
            if (dbData.data_sources && dbData.data_sources.length > 0) {
                dataSourceId = dbData.data_sources[0].id;
            }
        }

        // 2. Query the Data Source
        const response = await fetch(
            `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    filter: { property: 'Status', select: { equals: 'Test' } }, // Initially for Test
                    sorts: [{ property: 'Last edited time', direction: 'descending' }],
                    page_size: 1,
                }),
            }
        );

        if (!response.ok) {
            console.error('Failed to fetch from Notion Data Source:', await response.text());
            return;
        }

        const data = await response.json();
        const latestEdit = data.results?.[0]?.last_edited_time;

        // Last sync state logic
        const lastKnown = await env.DEPLOY_STATE_KV.get('lastEditedTime');

        if (latestEdit && latestEdit !== lastKnown) {
            await triggerDeploy(env);
            await env.DEPLOY_STATE_KV.put('lastEditedTime', latestEdit);
            console.log(`Cron deploy triggered. Latest edit: ${latestEdit}`);
        } else {
            console.log('No changes detected. Skipping deploy.');
        }
    },

    // Webhook Endpoint (Immediate sync)
    async fetch(request, env) {
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        const url = new URL(request.url);
        if (url.searchParams.get('secret') !== env.WEBHOOK_SECRET) {
            return new Response('Unauthorized', { status: 401 });
        }

        await triggerDeploy(env);

        return new Response(JSON.stringify({ ok: true, message: 'Webhook deploy triggered' }), {
            headers: { 'Content-Type': 'application/json' },
        });
    },
};

async function triggerDeploy(env) {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const projectName = env.CF_PROJECT_NAME;

    const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.CF_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
        }
    );
    if (!res.ok) {
        console.error('Failed to trigger deploy', await res.text());
    }
}
