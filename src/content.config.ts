/**
 * Content collections. The blog is the site's "slow channel" — news, analysis,
 * preparedness, and explainers (see docs/news-feed-content-brief.md). Posts are
 * markdown files in src/content/blog/, named `yyyy-mm-dd-topic.md`; the filename
 * becomes the URL: /blog/yyyy-mm-dd-topic.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    /** Plain, specific headline — sentence case, no colon-subtitle shapes. */
    title: z.string(),
    /** One-sentence summary, used in the feed listing + meta description. */
    description: z.string(),
    /** Publication date — must match the yyyy-mm-dd prefix of the filename. */
    pubDate: z.coerce.date(),
    /** One pillar tag, e.g. "Explainer", "Tech", "Preparedness", "Field Report", "Retrospective". */
    tag: z.string().optional(),
    /** Byline. Omit for organizational posts; the automated desk sets its own. */
    author: z.string().optional(),
  }),
});

export const collections = { blog };
