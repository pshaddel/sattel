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
    justify-content: flex-end;
    flex-grow: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1ch;
  }
  .entry { margin-bottom: 1; white-space: pre-wrap; }
  .entry.you { color: #5fafff; }
  .entry.message { color: #e0e0e0; }
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
  .hint {
    color: #555555;
    padding: 0 1ch;
  }
`;
