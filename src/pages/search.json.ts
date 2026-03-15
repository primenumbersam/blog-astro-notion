import { getCollection } from 'astro:content';

export async function GET() {
  const posts = await getCollection('posts');
  
  const searchIndex = posts
    .filter(post => !post.data.isPrivate)
    .map(post => ({
      title: post.data.title,
      slug: post.data.slug,
      description: post.data.description,
      tags: post.data.tags,
      date: post.data.createdTime,
    }));

  return new Response(JSON.stringify(searchIndex), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
