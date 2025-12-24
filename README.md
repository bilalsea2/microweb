# microweb

a chrome extension that turns websites grayscale and hides social engagement metrics.

## features

- **grayscale mode** - applies grayscale filter to any webpage
- **hide stats** - hides likes, views, subscribers, comment counts
- **color areas** - select regions to keep in full color
  - **fixed** - stays at that position on the page (scrolls with content)
  - **floating** - stays fixed on viewport (doesn't move when scrolling)
- **multi-selection** - add/edit/delete multiple color areas
- **per-page areas** - each page has its own set of color areas

## supported sites

| site | hidden metrics | notes |
|------|---------------|-------|
| youtube | views, likes, subs, comment counts | hides shorts from feed |
| twitch | viewers, followers | - |
| x.com | likes, reposts, views, replies | bookmarks visible, only media is grayscale |

## install (dev)

1. clone or download this repo
2. open `chrome://extensions/`
3. enable "developer mode" (top right)
4. click "load unpacked"
5. select the project folder

## usage

1. click the extension icon
2. toggle **grayscale** to enable/disable grayscale
3. toggle **hide stats** to show/hide engagement metrics
4. click **+ fixed area** or **+ floating area** to select color regions
5. manage areas with edit/delete buttons

## files

```
├── manifest.json
├── popup.html/js
├── content.js/css
└── images/
```

## chrome web store

to publish: zip the folder contents and upload to chrome developer dashboard.
