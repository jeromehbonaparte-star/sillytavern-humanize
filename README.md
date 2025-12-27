# SillyTavern Humanize Extension

A SillyTavern extension that allows you to rewrite AI messages to make them sound more natural and human-like.

## Features

- **One-Click Humanize**: Adds a magic wand button to each AI message
- **Customizable Prompt**: Edit the rewriting prompt to your preferences
- **Restore Default**: Easily restore the default prompt
- **Toast Notifications**: Visual feedback during processing

## Installation

### Method 1: Via SillyTavern Extension Installer (Recommended)

1. Open SillyTavern
2. Go to **Extensions** > **Install Extension**
3. Paste this URL: `https://github.com/jeromehbonaparte-star/sillytavern-humanize`
4. Click **Install**

### Method 2: Manual Installation

1. Navigate to your SillyTavern installation folder
2. Go to `public/scripts/extensions/third-party/`
3. Clone or download this repository:
   ```bash
   git clone https://github.com/jeromehbonaparte-star/sillytavern-humanize Humanize
   ```
4. Restart SillyTavern

## Usage

### Humanizing a Message

1. Hover over any AI message
2. Click the **magic wand** icon in the message action buttons
3. Wait for the "Rewriting message..." notification
4. The message will be replaced with a humanized version

### Customizing the Prompt

1. Go to **Extensions** panel
2. Find and expand **Humanize** settings
3. Edit the prompt in the textarea
4. Use `{{message}}` as a placeholder for the original message content
5. Click **Restore Default** to reset to the original prompt

## Default Prompt

```
Rewrite the current output. The conversation should flow more naturally and the dialogue should be more human-like, with the characters not being too logical or robotic. Keep the same general content and meaning, but make it sound more natural.

Original message to rewrite:
{{message}}
```

## Requirements

- SillyTavern 1.12.0 or higher
- A working AI API connection

## License

MIT License

## Author

[jeromehbonaparte-star](https://github.com/jeromehbonaparte-star)
