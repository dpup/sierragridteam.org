/**
 * /rss.xml — the blog's syndication feed. A prerendered endpoint (static output),
 * so it is written to disk at build time like every other page; no feed data is
 * fetched here (the blog is owned content, not live hazard data).
 *
 * It mirrors the on-site /blog ordering and honesty model exactly:
 *  - order by most-recent activity (`updatedDate ?? pubDate`), so a live fire
 *    bulletin that bumps to the top of /blog also re-surfaces in feed readers;
 *  - the item date is that same activity date;
 *  - the item link/guid is the stable permalink, so an updated live bulletin is
 *    shown as the same entry updated in place, not a duplicate;
 *  - a live bulletin's item text is its `summary` (the current-status fold head
 *    the feed shows), falling back to the post `description` for normal posts —
 *    never the full timeline, matching what /blog shows above the fold.
 *
 * Copy lives in config (site.ts / content.ts), per the golden rule.
 */
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { site } from '@config/site';
import { blog } from '@config/content';

export async function GET(context: APIContext) {
  const posts = await getCollection('blog');
  // Same activity key as /blog: a live bulletin's updatedDate bumps it up; normal
  // posts (no updatedDate) order by pubDate.
  const activity = (p: (typeof posts)[number]) => p.data.updatedDate ?? p.data.pubDate;
  const sorted = posts.sort((a, b) => activity(b).valueOf() - activity(a).valueOf());

  return rss({
    title: `${site.name} — Blog`,
    description: blog.intro,
    // Absolute-URL base for item links; astro.config sets `site`.
    site: context.site ?? site.url,
    trailingSlash: false,
    items: sorted.map((post) => ({
      title: post.data.title,
      // Prefer the live-bulletin fold head (current status); normal posts use their
      // one-sentence description. Never the full body — the permalink carries that.
      description: post.data.summary ?? post.data.description,
      link: `/blog/${post.id}`,
      pubDate: post.data.updatedDate ?? post.data.pubDate,
      ...(post.data.tag ? { categories: [post.data.tag] } : {}),
    })),
    customData: `<language>en-us</language>`,
  });
}
