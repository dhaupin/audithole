# Release posts

One post per release, shaped like the rest of the struct family (crashtest's
[discussions index](https://github.com/dhaupin/crashtest/blob/main/docs/discussions/index.md),
format lineage on prestruct). The post lives in `docs/discussions/` as
versioned source, so the release trail sits in the same tree as the changelog
it summarizes, and the file's raw markdown IS the GitHub Discussions
announcement - view source, copy, strip the frontmatter, post.

## The conventions

- **One file per release, named after it.** `announcing-vX.Y.Z.md`, matching
  the published version on the day the post is drafted. Never reuse a
  filename; if a release gets a retry, fold the delta into the same post.
- **The file IS the post.** No wrapper prose, no nested copy block: below the
  heading the file carries the announcement body itself, so the source of the
  doc is the source of the post. To publish, copy the raw markdown from GitHub
  (view source on the file) into the Discussions announcement. The posting
  mechanics live in this index, not in the posts themselves - the post body
  should stand alone in a forum.
- **Voice and facts.** Same rules as everywhere else in this repo: no
  marketing language, no cliches, and every number and claim verified against
  the code, the committed config, or the npm registry before it lands. If you
  cannot run it, do not write it.
- **Timing.** Draft the post against the released version, not the dev tree:
  cite what shipped, and keep in-tree-only work out of it. A post describing a
  version that is not published yet is fiction by promotion.

## The index

| post | version | live |
| --- | --- | --- |
| _(none yet)_ | | AuditHole is pre-1.0 and unpublished; the first post lands with the first release |

History: prestruct pioneered the format, crashtest adopted the same shape, and
this repo follows so approaches to the community discussion stay uniform across
the creadev family.
