import type { APIRoute } from 'astro';
import { ogCards } from '@config/og';
import { renderOgCard } from '@lib/og';

// One static PNG per card (home, mesh, alerts, contact, default).
export const getStaticPaths = () =>
  Object.entries(ogCards).map(([slug, card]) => ({ params: { slug }, props: card }));

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOgCard(props as Parameters<typeof renderOgCard>[0]);
  return new Response(new Blob([png], { type: 'image/png' }), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
