export const STYLES = `
  html, body { background-color: #0c0c0c; color: #e0e0e0; }
  body {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .banner {
    background-color: cyan;
    color: black;
    font-weight: bold;
    padding: 0 1ch;
  }
  .log {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1ch;
  }
  .entry { margin-bottom: 1; white-space: pre-wrap; }
  .entry.you { color: #5fafff; }
  .entry.message { color: #e0e0e0; }
  .entry.message .md-bold { font-weight: bold; }
  .entry.message .md-italic { font-style: italic; }
  .entry.message .md-code { color: #5fafff; }
  .entry.message .md-code-block { color: #e0e0e0; background-color: #1e1e1e; }
  .entry.message .md-heading { font-weight: bold; color: #ffd787; }
  .entry.message .md-list-item { color: #ffffff; }
  .entry.message .md-code-block .hljs-comment,
  .entry.message .md-code-block .hljs-quote { color: #6a9955; font-style: italic; }
  .entry.message .md-code-block .hljs-keyword,
  .entry.message .md-code-block .hljs-selector-tag,
  .entry.message .md-code-block .hljs-tag { color: #ff79c6; font-weight: bold; }
  .entry.message .md-code-block .hljs-string,
  .entry.message .md-code-block .hljs-doctag,
  .entry.message .md-code-block .hljs-regexp { color: #f1fa8c; }
  .entry.message .md-code-block .hljs-number,
  .entry.message .md-code-block .hljs-literal { color: #bd93f9; }
  .entry.message .md-code-block .hljs-title,
  .entry.message .md-code-block .hljs-title.function_,
  .entry.message .md-code-block .hljs-section { color: #50fa7b; }
  .entry.message .md-code-block .hljs-title.class_,
  .entry.message .md-code-block .hljs-type { color: #8be9fd; font-weight: bold; }
  .entry.message .md-code-block .hljs-built_in,
  .entry.message .md-code-block .hljs-builtin-name,
  .entry.message .md-code-block .hljs-name { color: #8be9fd; }
  .entry.message .md-code-block .hljs-attr,
  .entry.message .md-code-block .hljs-attribute,
  .entry.message .md-code-block .hljs-params,
  .entry.message .md-code-block .hljs-variable { color: #ffb86c; }
  .entry.message .md-code-block .hljs-symbol,
  .entry.message .md-code-block .hljs-bullet,
  .entry.message .md-code-block .hljs-meta { color: #ff79c6; }
  .entry.message .md-code-block .hljs-deletion { color: #ff5555; }
  .entry.message .md-code-block .hljs-addition { color: #50fa7b; }
  .entry.message .md-code-block .hljs-emphasis { font-style: italic; }
  .entry.message .md-code-block .hljs-strong { font-weight: bold; }
  .entry.thinking { color: #666666; font-style: italic; }
  .entry.tool-box {
    align-self: flex-start;
    white-space: nowrap;
    border-left: 2px solid #3a3a3a;
    padding-left: 1ch;
    margin-bottom: 0;
    color: #9a9a9a;
  }
  .entry.tool-box.done {
    border-left-color: #4a4a4a;
    color: #d0d0d0;
  }
  .entry.outro { color: green; font-weight: bold; }
  .entry.approval-prompt { color: yellow; font-weight: bold; }
  .prompt-row {
    display: flex;
    align-items: center;
    border-top: 1px solid #444444;
    padding: 0 1ch;
  }
  .sigil { color: cyan; font-weight: bold; padding: 0 1ch 0 0; }
  .input-wrap { position: relative; flex-grow: 1; }
  .input-wrap textarea {
    width: 100%;
    background-color: #0c0c0c;
    color: #0c0c0c;
    border: none;
  }
  .input-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: 0 1ch;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    color: #e0e0e0;
  }
  .input-overlay .command { color: #5fafff; font-weight: bold; }
  .command-palette {
    display: flex;
    flex-direction: column;
    padding: 0 1ch;
  }
  .palette-item { display: flex; gap: 2ch; padding: 0 1ch; }
  .palette-item.selected { background-color: #1c1c1c; }
  .palette-name { color: #5fafff; font-weight: bold; min-width: 10ch; }
  .palette-match { color: #ffd75f; }
  .palette-description { color: #888888; }
  .palette-item.selected .palette-description { color: #cfcfcf; }
  .hint {
    color: #555555;
    padding: 0 1ch;
  }
`;
