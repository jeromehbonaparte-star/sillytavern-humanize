# SillyTavern Extension Development Guide

This document captures key learnings for developing SillyTavern extensions.

## Extension Structure

```
sillytavern-humanize/
├── manifest.json      # Extension metadata (required)
├── index.js           # Main extension logic (required)
├── settings.html      # Settings panel template (required for settings UI)
├── style.css          # Styling (optional)
├── README.md          # User documentation
└── DEVELOPMENT.md     # This file
```

## Critical: Extension Naming

The `extensionName` variable **MUST** include the `third-party/` prefix and match the folder name exactly:

```javascript
// CORRECT - includes third-party prefix and matches repo/folder name
const extensionName = 'third-party/sillytavern-humanize';

// WRONG - missing prefix
const extensionName = 'Humanize';
const extensionName = 'sillytavern-humanize';
```

When installed via SillyTavern's extension installer, the folder name will be the GitHub repo name (e.g., `sillytavern-humanize`).

## Imports

### From `extensions.js` (relative path: `../../../extensions.js`)
- `extension_settings` - Object to store extension settings
- `getContext` - Get current chat context
- `renderExtensionTemplateAsync` - Load HTML templates

### From `script.js` (relative path: `../../../../script.js`)
- `eventSource` - Event emitter for SillyTavern events
- `event_types` - Constants for event names
- `generateQuietPrompt` - Generate AI response without adding to chat
- `saveChatDebounced` - Save chat with debouncing
- `saveSettingsDebounced` - Save settings with debouncing

**Important:** `saveSettingsDebounced` is from `script.js`, NOT `extensions.js`!

## Settings Panel

### Loading Settings HTML

Use `renderExtensionTemplateAsync` to load the `settings.html` file:

```javascript
const settingsHtml = await renderExtensionTemplateAsync(extensionName, 'settings');
$('#extensions_settings2').append(settingsHtml);
```

The function builds the path as: `scripts/extensions/${extensionName}/${templateId}.html`

That's why `extensionName` must be `third-party/sillytavern-humanize` - it builds the full path.

### Settings Storage

Use a simple key for `extension_settings` to avoid path issues:

```javascript
const settingsKey = 'humanize';  // Simple key for storage
extension_settings[settingsKey] = { ... };
```

## Event Types

Common events to listen for:

```javascript
// Chat changed (new character selected, chat loaded)
eventSource.on(event_types.CHAT_CHANGED, () => { });

// AI message received
eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => { });

// AI message rendered in DOM
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => { });

// User message rendered
eventSource.on(event_types.USER_MESSAGE_RENDERED, (messageId) => { });
```

## Adding Buttons to Messages

Messages have the attribute `mesid` for their index:

```javascript
const messageBlock = $(`.mes[mesid="${messageId}"]`);

// Check if user message
const isUser = messageBlock.attr('is_user') === 'true';

// Find the extra buttons container
const extraButtons = messageBlock.find('.extraMesButtons');

// Add button
const button = $(`<div class="mes_button fa-solid fa-icon interactable" title="Tooltip"></div>`);
extraButtons.prepend(button);
```

## Toast Notifications

SillyTavern uses `toastr` for notifications:

```javascript
toastr.info('Message', 'Title');
toastr.success('Message', 'Title');
toastr.warning('Message', 'Title');
toastr.error('Message', 'Title');

// Persistent toast (no auto-dismiss)
toastr.info('Loading...', 'Title', { timeOut: 0, extendedTimeOut: 0 });

// Clear all toasts
toastr.clear();
```

## Generating AI Responses

Use `generateQuietPrompt` to get AI response without adding to chat:

```javascript
const response = await generateQuietPrompt(promptText, false, false);
```

## manifest.json

```json
{
    "display_name": "Extension Name",
    "loading_order": 100,
    "requires": [],
    "optional": [],
    "js": "index.js",
    "css": "style.css",
    "author": "Your Name",
    "version": "1.0.0",
    "homePage": "https://github.com/...",
    "auto_update": true
}
```

## Debugging

1. Open browser DevTools (F12)
2. Check Console for errors
3. Add `console.log('[ExtensionName] message')` for debugging
4. Check Network tab if templates fail to load

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `does not provide an export named 'X'` | Wrong import source | Check which file exports the function |
| Template not loading | Wrong `extensionName` | Must include `third-party/` prefix |
| Settings not appearing | Wrong container selector | Use `#extensions_settings2` for third-party |
| Buttons not appearing | Events not firing | Add delays with `setTimeout`, check event names |

## Reference Extensions

- [rpg-companion-sillytavern](https://github.com/SpicyMarinara/rpg-companion-sillytavern) - Complex extension with good patterns
- [SillyTavern source](https://github.com/SillyTavern/SillyTavern) - Check `public/scripts/extensions.js` for available exports

## Testing Updates

After pushing changes:
1. SSH into server: `cd /path/to/extensions/third-party/sillytavern-humanize && git pull`
2. Hard refresh browser: `Ctrl+Shift+R`
3. Check console for `[ExtensionName] Extension loaded successfully`
