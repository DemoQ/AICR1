---
name: testing-nextjs-blog
description: How to install deps, run, and test this Next.js 10 blog (nextjs-blog / AICR1) locally, including the posts/ fixture trick for list & pagination testing.
---

# Testing the Next.js 10 blog locally

## Install dependencies
`yarn.lock` points at an unreachable internal registry, so yarn install will hang/fail. Use:

```bash
npm install --no-package-lock --registry https://registry.npmjs.org
```

## Running dev / build (Node 18+)
Next 10 uses a webpack build that breaks on modern Node's OpenSSL 3 (`ERR_OSSL_EVP_UNSUPPORTED`).
Always prefix both commands:

```bash
NODE_OPTIONS=--openssl-legacy-provider npm run dev    # http://localhost:3000
NODE_OPTIONS=--openssl-legacy-provider npm run build
```

If a build/dev start fails with a digital-envelope / OpenSSL error, the missing flag is the likely cause.

## Blog list fixtures (pagination, sorting, empty states)
The home page (`pages/index.js`) gets its posts from `lib/posts.js:getSortedPostsData()`, which reads
every `posts/*.md` file and sorts by front-matter `date` **descending**. The repo ships only 2 posts,
which is not enough to exercise list/pagination behavior — create temporary fixtures:

```bash
cd posts && for i in 1 2 3 4 5 6; do printf -- "---\ntitle: 'Temp Post %s'\ndate: '2021-01-0%s'\n---\n\nbody\n" $i $i > temp-post-$i.md; done
```

Dates newer than the shipped posts (2020-01-0x) make ordering fully predictable, so you can assert the
exact titles expected on each page. `next dev` picks new/removed files up on a plain page reload
(no server restart needed). **Delete the fixtures (`rm posts/temp-post-*.md`) and verify `git status`
is clean before finishing** — and keep any test-plan/report files outside the repo so they can't be committed.

## Devin Secrets Needed
None — everything runs locally with no credentials.
