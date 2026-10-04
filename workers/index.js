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
                    filter: { property: 'Status', select: { equals: 'Published' } },
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
            console.log(`Changes detected. Latest edit: ${latestEdit}, Last known: ${lastKnown}`);
            const deploymentId = await triggerDeploy(env);

            if (!deploymentId) {
                console.error('Failed to trigger deployment. Will retry on next cron.');
                return;
            }

            console.log(`Deployment ${deploymentId} triggered. Verifying build and deploy status...`);
            const isSuccess = await waitForDeployment(env, deploymentId);

            if (isSuccess) {
                await env.DEPLOY_STATE_KV.put('lastEditedTime', latestEdit);
                console.log(`Deployment verified. KV updated to latest edit: ${latestEdit}`);
            } else {
                console.error(`Deployment ${deploymentId} failed or timed out. Keeping KV at ${lastKnown} to retry on next cron.`);
            }
        } else {
            console.log('No changes detected. Skipping deploy.');
        }
    },

    // Webhook Endpoint (Immediate sync)
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        const url = new URL(request.url);
        if (url.searchParams.get('secret') !== env.WEBHOOK_SECRET) {
            return new Response('Unauthorized', { status: 401 });
        }

        const deploymentId = await triggerDeploy(env);

        if (deploymentId && ctx?.waitUntil) {
            ctx.waitUntil(waitForDeployment(env, deploymentId));
        }

        return new Response(JSON.stringify({ ok: Boolean(deploymentId), deploymentId }), {
            headers: { 'Content-Type': 'application/json' },
        });
    },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        console.error('Failed to trigger deploy:', await res.text());
        return null;
    }
    const data = await res.json();
    return data.result?.id ?? null;
}

async function waitForDeployment(env, deploymentId, maxWaitSec = 600, pollIntervalSec = 10) {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const projectName = env.CF_PROJECT_NAME;
    const headers = {
        'Authorization': `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
    };

    const maxAttempts = Math.ceil(maxWaitSec / pollIntervalSec);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await sleep(pollIntervalSec * 1000);

        try {
            const res = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}`,
                { method: 'GET', headers }
            );

            if (!res.ok) {
                console.warn(`Failed to poll deployment status (attempt ${attempt}/${maxAttempts}): ${res.status}`);
                continue;
            }

            const data = await res.json();
            const deployment = data.result;
            const latestStage = deployment?.latest_stage;
            const stages = deployment?.stages || [];

            const hasFailure = latestStage?.status === 'failure' || stages.some((s) => s.status === 'failure');
            if (hasFailure) {
                console.error(`Deployment ${deploymentId} failed at stage: ${latestStage?.name || 'unknown'}`);
                return false;
            }

            const isDeployed = latestStage?.name === 'deploy' && latestStage?.status === 'success';
            if (isDeployed) {
                console.log(`Deployment ${deploymentId} succeeded.`);
                return true;
            }

            console.log(`Deployment ${deploymentId} in progress (stage: ${latestStage?.name}, status: ${latestStage?.status})...`);
        } catch (err) {
            console.warn(`Polling error for deployment ${deploymentId}:`, err);
        }
    }

    console.error(`Deployment ${deploymentId} polling timed out after ${maxWaitSec}s.`);
    return false;
}
