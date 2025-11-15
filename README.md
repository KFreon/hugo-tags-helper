# Blog Tags Helper  
Simple extension to stop me accidentally duplicating tags.  
When on the `tags:` line of frontmatter, this extension will suggest previously used tags.  

This extension regenerates tags every 7 days or can be manually regenerated with command `Regenerate Blog Tags`.  

![Demo](Hugo_Tags.gif)

## Configuration

The extension can be configured with the following settings:

- `blogTagsHelper.enable`: Enable or disable the extension (default: `true`)
- `blogTagsHelper.fileGlobPattern`: Glob pattern to find markdown files with frontmatter (default: `**/index.md`)
  - Examples: `src/posts/**/*.md`, `content/**/*.md`, `blog/**/*.md`

To configure, add the settings to your workspace or user settings:

```json
{
  "blogTagsHelper.enable": true,
  "blogTagsHelper.fileGlobPattern": "content/**/*.md"
}
```

## Notes  
- Currently only supporting `---` frontmatter definitions  
- Expects single line `tags:`  
- Can be used with any static site generator (Hugo, Jekyll, Gatsby, etc.)



// handle +++
// handle multi-line tags array
// Can we do anything tricky with the language server?