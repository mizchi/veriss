// The pages of the safe-subset coverage corpus (tools/corpus/capture.mjs).
// kind: docs | news-blog | commerce | app-dashboard | landing | reference | fixture. system: the CSS system the page is
// built with, where known from the page itself (class names, sheet URLs), or 'custom'.
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

const VLMKIT_TERMS = 'mizchi/vlmkit (MIT): agent-built demo pages and test fixtures';

/** vlmkit's demo sites, landing page and fixtures, read from a local checkout. */
export function localSources(vlmkit) {
  const page = (id, path, kind, system = 'custom') => ({id: `vlmkit-${id}`, path, url: pathToFileURL(join(vlmkit, path)).href, kind, system, terms: VLMKIT_TERMS});
  return [
    page('sites-docs', 'examples/sites/docs/index.html', 'docs'),
    page('sites-docs-cli', 'examples/sites/docs/cli.html', 'docs'),
    page('sites-docs-migrations', 'examples/sites/docs/migrations.html', 'docs'),
    page('sites-shop', 'examples/sites/shop/index.html', 'commerce'),
    page('sites-dashboard', 'examples/sites/dashboard/index.html', 'app-dashboard'),
    page('sites-magazine', 'examples/sites/magazine/index.html', 'news-blog'),
    page('sites-checkout', 'examples/sites/checkout/index.html', 'commerce'),
    page('sites-kanban', 'examples/sites/kanban/index.html', 'app-dashboard'),
    page('sites-gallery', 'examples/sites/index.html', 'landing'),
    page('intro-page', 'examples/vlmkit-intro-page/index.html', 'landing'),
    page('solitaire', 'examples/solitaire/index.html', 'app-dashboard'),
    ...['admin-panel', 'blog-magazine', 'dashboard', 'ecommerce-catalog', 'form-app', 'grid-complex', 'landing-product', 'page', 'stacking-context']
      .map(n => page(`css-challenge-${n}`, `fixtures/css-challenge/${n}.html`, 'fixture')),
    ...['card-grid', 'container-card', 'data-table', 'drawer', 'form-row', 'hero', 'masthead', 'media-object', 'pricing', 'sidebar-layout', 'toolbar']
      .map(n => page(`responsive-${n}`, `fixtures/responsive-patterns/patterns/${n}.html`, 'fixture')),
  ];
}

const pub = (id, url, kind, system, terms = 'public page; snapshot kept local, not redistributed') => ({id, url, kind, system, public: true, terms});

/** Public pages without login. Each is fetched once, after its robots.txt allows it. */
export const publicSources = [
  // Documentation
  pub('mdn-css-display', 'https://developer.mozilla.org/en-US/docs/Web/CSS/display', 'docs', 'custom (MDN)', 'MDN content CC-BY-SA 2.5; code MIT/CC0'),
  pub('python-tutorial', 'https://docs.python.org/3/tutorial/index.html', 'docs', 'sphinx', 'PSF documentation license'),
  pub('react-learn', 'https://react.dev/learn', 'docs', 'tailwind', 'react.dev content CC-BY-4.0'),
  pub('vite-guide', 'https://vite.dev/guide/', 'docs', 'vitepress', 'vite docs MIT'),
  pub('tailwind-docs', 'https://tailwindcss.com/docs/installation/using-vite', 'docs', 'tailwind'),
  pub('primer-docs', 'https://primer.style/product/getting-started/', 'docs', 'primer'),
  pub('mui-docs', 'https://mui.com/material-ui/getting-started/', 'docs', 'mui'),
  pub('bootstrap-docs', 'https://getbootstrap.com/docs/5.3/getting-started/introduction/', 'docs', 'bootstrap', 'Bootstrap docs CC-BY-3.0'),
  pub('rust-book', 'https://doc.rust-lang.org/book/ch01-00-getting-started.html', 'docs', 'mdbook', 'MIT/Apache-2.0'),
  pub('govuk-design-system', 'https://design-system.service.gov.uk/components/button/', 'docs', 'govuk-frontend', 'Open Government Licence v3.0'),
  // Reference / encyclopedia / spec
  pub('wikipedia-css', 'https://en.wikipedia.org/wiki/CSS', 'reference', 'mediawiki', 'CC-BY-SA 4.0'),
  pub('w3c-css-grid', 'https://www.w3.org/TR/css-grid-2/', 'reference', 'w3c-tr', 'W3C Document License'),
  pub('hacker-news', 'https://news.ycombinator.com/', 'news-blog', 'table-layout'),
  // News / blog
  pub('cloudflare-blog', 'https://blog.cloudflare.com/', 'news-blog', 'custom'),
  pub('github-blog', 'https://github.blog/', 'news-blog', 'wordpress'),
  pub('overreacted', 'https://overreacted.io/', 'news-blog', 'tailwind'),
  pub('danluu', 'https://danluu.com/', 'news-blog', 'none (no CSS)'),
  pub('css-tricks', 'https://css-tricks.com/', 'news-blog', 'wordpress'),
  pub('smashing', 'https://www.smashingmagazine.com/', 'news-blog', 'custom'),
  pub('gov-uk', 'https://www.gov.uk/', 'news-blog', 'govuk-frontend', 'Open Government Licence v3.0'),
  // Commerce
  pub('vercel-commerce', 'https://demo.vercel.store/', 'commerce', 'tailwind (next.js commerce)'),
  pub('ikea-home', 'https://www.ikea.com/us/en/', 'commerce', 'custom (skapa)'),
  pub('bootstrap-checkout', 'https://getbootstrap.com/docs/5.3/examples/checkout/', 'commerce', 'bootstrap', 'Bootstrap examples MIT'),
  pub('shopify-dawn', 'https://theme-dawn-demo.myshopify.com/', 'commerce', 'shopify dawn'),
  // App shells / dashboards
  pub('shadcn-dashboard', 'https://ui.shadcn.com/examples/dashboard', 'app-dashboard', 'shadcn/radix + tailwind'),
  pub('bootstrap-dashboard', 'https://getbootstrap.com/docs/5.3/examples/dashboard/', 'app-dashboard', 'bootstrap', 'Bootstrap examples MIT'),
  pub('bootstrap-album', 'https://getbootstrap.com/docs/5.3/examples/album/', 'landing', 'bootstrap', 'Bootstrap examples MIT'),
  pub('tabler-preview', 'https://preview.tabler.io/', 'app-dashboard', 'tabler (bootstrap)', 'Tabler MIT'),
  pub('mui-dashboard', 'https://mui.com/material-ui/getting-started/templates/dashboard/', 'app-dashboard', 'mui'),
  // Landing pages
  pub('shadcn-home', 'https://ui.shadcn.com/', 'landing', 'shadcn/radix + tailwind'),
  pub('radix-home', 'https://www.radix-ui.com/', 'landing', 'radix themes'),
  pub('astro-home', 'https://astro.build/', 'landing', 'tailwind'),
  pub('svelte-home', 'https://svelte.dev/', 'landing', 'custom (svelte)'),
  pub('nodejs-home', 'https://nodejs.org/en', 'landing', 'tailwind'),
  pub('stripe-home', 'https://stripe.com/', 'landing', 'custom'),
  pub('linear-home', 'https://linear.app/', 'landing', 'custom'),
  pub('vercel-home', 'https://vercel.com/', 'landing', 'tailwind + geist'),
  pub('mui-home', 'https://mui.com/', 'landing', 'mui'),
];
