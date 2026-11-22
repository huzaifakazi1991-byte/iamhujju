# AI Gallery media

Drop your frames here. They ship with the app in git (Render's free plan has an
ephemeral disk, so files must live in the repository) and are served from
`/media/gallery/<file>`.

## Adding a photo
1. Upload the image into this folder (drag-and-drop on github.com works).
2. Add an entry to `items` in `platform/src/lib/gallery.ts`:

```ts
{
  file: 'my-photo.jpg',
  title: 'My photo',
  why: 'Why it was made…',
  madeWith: 'Which model / how…',
  template: 'The ready-made recreation prompt users get when they tap 🎨 Recreate this.',
}
```

## Adding a video
Same as above, but upload an `.mp4` (H.264, keep it under ~5 MB so the site
stays fast) and set `kind: 'video'` plus an optional `poster` image that shows
before the video plays:

```ts
{
  file: 'my-reel.mp4',
  kind: 'video',
  poster: 'my-reel-poster.jpg',
  title: 'My reel',
  why: '…',
  madeWith: '…',
  template: '…',
}
```

The gallery renders videos with a play badge on the card and a full player in
the lightbox. `gallery-reel-demo.mp4` is a working example — replace it any
time with your own reel.

Each item also powers its own "ready-made template": the lightbox button
"🎨 Recreate this" opens `/playground?template=<file-slug>` where the file name
without extension is the slug (e.g. `my-reel`), and the playground composer is
prefilled with the item's `template` prompt.
