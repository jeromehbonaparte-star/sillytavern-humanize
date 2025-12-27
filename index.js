import {
    extension_settings,
    getContext,
    saveSettingsDebounced,
} from '../../../extensions.js';

import {
    eventSource,
    event_types,
    generateQuietPrompt,
    saveChat,
    messageFormatting,
} from '../../../../script.js';

const extensionName = 'Humanize';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const DEFAULT_PROMPT = `Rewrite the current output. The conversation should flow more naturally and the dialogue should be more human-like, with the characters not being too logical or robotic. Keep the same general content and meaning, but make it sound more natural.

Original message to rewrite:
{{message}}`;

const defaultSettings = {
    enabled: true,
    prompt: DEFAULT_PROMPT,
};

/**
 * Load extension settings
 */
function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    // Ensure prompt exists
    if (!extension_settings[extensionName].prompt) {
        extension_settings[extensionName].prompt = DEFAULT_PROMPT;
    }

    // Update UI
    $('#humanize_enabled').prop('checked', extension_settings[extensionName].enabled);
    $('#humanize_prompt').val(extension_settings[extensionName].prompt);
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of toast ('info', 'success', 'warning', 'error')
 */
function showToast(message, type = 'info') {
    if (typeof toastr !== 'undefined') {
        toastr[type](message, 'Humanize');
    } else {
        console.log(`[Humanize] ${type}: ${message}`);
    }
}

/**
 * Humanize a message
 * @param {number} messageId - The message index to humanize
 */
async function humanizeMessage(messageId) {
    const context = getContext();
    const chat = context.chat;

    if (!chat || !chat[messageId]) {
        showToast('Message not found', 'error');
        return;
    }

    const message = chat[messageId];

    // Only allow humanizing AI messages
    if (message.is_user) {
        showToast('Can only humanize AI messages', 'warning');
        return;
    }

    const originalContent = message.mes;

    if (!originalContent || originalContent.trim() === '') {
        showToast('Message is empty', 'warning');
        return;
    }

    // Get the prompt template
    const promptTemplate = extension_settings[extensionName].prompt || DEFAULT_PROMPT;
    const fullPrompt = promptTemplate.replace('{{message}}', originalContent);

    // Show processing toast
    showToast('Rewriting message...', 'info');

    try {
        // Disable the humanize button during processing
        const button = $(`.humanize-button[data-message-id="${messageId}"]`);
        button.prop('disabled', true).addClass('processing');

        // Generate the humanized response
        const humanizedText = await generateQuietPrompt(fullPrompt, false, false);

        if (!humanizedText || humanizedText.trim() === '') {
            showToast('Failed to generate humanized text', 'error');
            button.prop('disabled', false).removeClass('processing');
            return;
        }

        // Update the message in chat
        chat[messageId].mes = humanizedText;

        // Update the displayed message
        const messageBlock = $(`#chat .mes[mesid="${messageId}"]`);
        messageBlock.find('.mes_text').html(messageFormatting(
            humanizedText,
            message.name,
            message.is_system,
            message.is_user,
            messageId
        ));

        // Save the chat
        await saveChat();

        showToast('Message humanized successfully!', 'success');
        button.prop('disabled', false).removeClass('processing');

    } catch (error) {
        console.error('[Humanize] Error:', error);
        showToast('Error humanizing message: ' + error.message, 'error');
        const button = $(`.humanize-button[data-message-id="${messageId}"]`);
        button.prop('disabled', false).removeClass('processing');
    }
}

/**
 * Add humanize button to a message
 * @param {number} messageId - The message index
 */
function addHumanizeButton(messageId) {
    const messageBlock = $(`#chat .mes[mesid="${messageId}"]`);

    if (messageBlock.length === 0) return;

    // Check if it's an AI message (not user message)
    const isUser = messageBlock.attr('is_user') === 'true';
    if (isUser) return;

    // Check if button already exists
    if (messageBlock.find('.humanize-button').length > 0) return;

    // Find the extra buttons container
    const extraButtons = messageBlock.find('.extraMesButtons');

    if (extraButtons.length === 0) return;

    // Create the humanize button
    const humanizeButton = $(`
        <div class="humanize-button mes_button fa-solid fa-wand-magic-sparkles interactable"
             title="Humanize this message"
             data-message-id="${messageId}">
        </div>
    `);

    // Add click handler
    humanizeButton.on('click', function(e) {
        e.stopPropagation();
        const msgId = parseInt($(this).data('message-id'));
        humanizeMessage(msgId);
    });

    // Append to extra buttons
    extraButtons.prepend(humanizeButton);
}

/**
 * Add humanize buttons to all existing messages
 */
function addButtonsToAllMessages() {
    $('#chat .mes').each(function() {
        const messageId = parseInt($(this).attr('mesid'));
        if (!isNaN(messageId)) {
            addHumanizeButton(messageId);
        }
    });
}

/**
 * Restore default prompt
 */
function restoreDefaultPrompt() {
    extension_settings[extensionName].prompt = DEFAULT_PROMPT;
    $('#humanize_prompt').val(DEFAULT_PROMPT);
    saveSettingsDebounced();
    showToast('Default prompt restored', 'success');
}

/**
 * Create the settings HTML
 */
function createSettingsHtml() {
    const settingsHtml = `
        <div id="humanize_settings" class="humanize-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Humanize</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="humanize-settings-content">
                        <label class="checkbox_label" for="humanize_enabled">
                            <input type="checkbox" id="humanize_enabled" />
                            <span>Enable Humanize</span>
                        </label>

                        <div class="humanize-prompt-section">
                            <label for="humanize_prompt">
                                <span>Humanize Prompt</span>
                                <small class="humanize-hint">Use {{message}} as placeholder for the original message</small>
                            </label>
                            <textarea id="humanize_prompt" class="text_pole textarea_compact" rows="6" placeholder="Enter your humanize prompt..."></textarea>
                        </div>

                        <div class="humanize-buttons">
                            <input type="button" id="humanize_restore_default" class="menu_button" value="Restore Default" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    return settingsHtml;
}

/**
 * Initialize the extension
 */
jQuery(async () => {
    // Add settings panel to the extensions settings area
    const settingsContainer = $('#extensions_settings2');
    if (settingsContainer.length === 0) {
        console.error('[Humanize] Could not find extensions settings container');
        return;
    }

    settingsContainer.append(createSettingsHtml());

    // Load settings
    loadSettings();

    // Event handlers for settings
    $('#humanize_enabled').on('change', function() {
        extension_settings[extensionName].enabled = $(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#humanize_prompt').on('input', function() {
        extension_settings[extensionName].prompt = $(this).val();
        saveSettingsDebounced();
    });

    $('#humanize_restore_default').on('click', restoreDefaultPrompt);

    // Add buttons to existing messages on chat load
    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(addButtonsToAllMessages, 300);
    });

    // Add button to new messages
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
        setTimeout(() => addHumanizeButton(messageId), 300);
    });

    eventSource.on(event_types.MESSAGE_SENT, (messageId) => {
        setTimeout(() => addHumanizeButton(messageId), 300);
    });

    // Also listen for when messages are rendered
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        setTimeout(() => addHumanizeButton(messageId), 100);
    });

    eventSource.on(event_types.USER_MESSAGE_RENDERED, (messageId) => {
        // User messages don't need the button, but trigger a refresh
        setTimeout(addButtonsToAllMessages, 100);
    });

    // Initial button addition with longer delay to ensure DOM is ready
    setTimeout(addButtonsToAllMessages, 1000);

    console.log('[Humanize] Extension loaded successfully');
});

// Export for potential use by other extensions
export { humanizeMessage, DEFAULT_PROMPT };
