import {
    extension_settings,
    getContext,
    renderExtensionTemplateAsync,
} from '../../../extensions.js';

import {
    eventSource,
    event_types,
    generateQuietPrompt,
    saveChatDebounced,
    saveSettingsDebounced,
} from '../../../../script.js';

// Extension name must include 'third-party/' prefix and match the folder name
const extensionName = 'third-party/sillytavern-humanize';
const extensionFolderPath = `scripts/extensions/${extensionName}`;
const settingsKey = 'humanize'; // Key for extension_settings

const DEFAULT_PROMPT = `Rewrite the current output. The conversation should flow more naturally and the dialogue should be more human-like, with the characters not being too logical or robotic. Keep the same general content and meaning, but make it sound more natural.

Here is the conversation context leading up to this message:
{{context}}

Original message to rewrite:
{{message}}`;

const defaultSettings = {
    enabled: true,
    prompt: DEFAULT_PROMPT,
    contextDepth: 10, // Number of messages to include as context
};

/**
 * Load extension settings
 */
function loadSettings() {
    extension_settings[settingsKey] = extension_settings[settingsKey] || {};

    if (Object.keys(extension_settings[settingsKey]).length === 0) {
        Object.assign(extension_settings[settingsKey], defaultSettings);
    }

    // Ensure prompt exists
    if (!extension_settings[settingsKey].prompt) {
        extension_settings[settingsKey].prompt = DEFAULT_PROMPT;
    }

    // Ensure contextDepth exists
    if (extension_settings[settingsKey].contextDepth === undefined) {
        extension_settings[settingsKey].contextDepth = defaultSettings.contextDepth;
    }

    // Update UI
    $('#humanize_enabled').prop('checked', extension_settings[settingsKey].enabled);
    $('#humanize_prompt').val(extension_settings[settingsKey].prompt);
    $('#humanize_context_depth').val(extension_settings[settingsKey].contextDepth);
}

/**
 * Humanize a message
 * @param {number} messageId - The message index to humanize
 */
async function humanizeMessage(messageId) {
    const context = getContext();
    const chat = context.chat;

    if (!chat || !chat[messageId]) {
        toastr.error('Message not found', 'Humanize');
        return;
    }

    const message = chat[messageId];

    // Only allow humanizing AI messages
    if (message.is_user) {
        toastr.warning('Can only humanize AI messages', 'Humanize');
        return;
    }

    const originalContent = message.mes;

    if (!originalContent || originalContent.trim() === '') {
        toastr.warning('Message is empty', 'Humanize');
        return;
    }

    // Build chat context
    const contextDepth = extension_settings[settingsKey].contextDepth || 10;
    const startIndex = Math.max(0, messageId - contextDepth);
    let contextMessages = [];

    for (let i = startIndex; i < messageId; i++) {
        const msg = chat[i];
        if (msg && msg.mes) {
            const name = msg.is_user ? 'User' : (msg.name || 'Character');
            contextMessages.push(`${name}: ${msg.mes}`);
        }
    }

    const contextString = contextMessages.length > 0
        ? contextMessages.join('\n\n')
        : '(No previous context)';

    // Get the prompt template
    const promptTemplate = extension_settings[settingsKey].prompt || DEFAULT_PROMPT;
    const fullPrompt = promptTemplate
        .replace('{{context}}', contextString)
        .replace('{{message}}', originalContent);

    // Show processing toast
    toastr.info('Rewriting message...', 'Humanize', { timeOut: 0, extendedTimeOut: 0 });

    try {
        // Disable the humanize button during processing
        const button = $(`.humanize-msg-btn[data-message-id="${messageId}"]`);
        button.addClass('disabled');

        // Generate the humanized response using object parameter syntax
        const humanizedText = await generateQuietPrompt({ quietPrompt: fullPrompt });

        // Clear the processing toast
        toastr.clear();

        if (!humanizedText || humanizedText.trim() === '') {
            toastr.error('Failed to generate humanized text', 'Humanize');
            button.removeClass('disabled');
            return;
        }

        // Update the message in chat
        chat[messageId].mes = humanizedText;

        // Update the displayed message - find and update the mes_text div
        const messageBlock = $(`.mes[mesid="${messageId}"]`);
        if (messageBlock.length) {
            // Use SillyTavern's built-in message formatting if available
            const mesTextElement = messageBlock.find('.mes_text');
            if (mesTextElement.length) {
                mesTextElement.html(humanizedText);
            }
        }

        // Save the chat
        saveChatDebounced();

        toastr.success('Message humanized!', 'Humanize');
        button.removeClass('disabled');

    } catch (error) {
        console.error('[Humanize] Error:', error);
        toastr.clear();
        toastr.error('Error: ' + error.message, 'Humanize');
        const button = $(`.humanize-msg-btn[data-message-id="${messageId}"]`);
        button.removeClass('disabled');
    }
}

/**
 * Add humanize button to a message
 * @param {number} messageId - The message index
 */
function addHumanizeButton(messageId) {
    if (!extension_settings[settingsKey]?.enabled) return;

    const messageBlock = $(`.mes[mesid="${messageId}"]`);
    if (messageBlock.length === 0) return;

    // Check if it's an AI message (not user message)
    const isUser = messageBlock.attr('is_user') === 'true';
    if (isUser) return;

    // Check if button already exists
    if (messageBlock.find('.humanize-msg-btn').length > 0) return;

    // Find the extra buttons container
    const extraButtons = messageBlock.find('.extraMesButtons');
    if (extraButtons.length === 0) return;

    // Create the humanize button
    const humanizeButton = $(`<div class="humanize-msg-btn mes_button fa-solid fa-wand-magic-sparkles interactable" title="Humanize this message" data-message-id="${messageId}"></div>`);

    // Add click handler
    humanizeButton.on('click', function (e) {
        e.stopPropagation();
        if ($(this).hasClass('disabled')) return;
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
    if (!extension_settings[settingsKey]?.enabled) return;

    $('.mes').each(function () {
        const messageId = parseInt($(this).attr('mesid'));
        if (!isNaN(messageId)) {
            addHumanizeButton(messageId);
        }
    });
}

/**
 * Remove all humanize buttons
 */
function removeAllButtons() {
    $('.humanize-msg-btn').remove();
}

/**
 * Restore default prompt
 */
function restoreDefaultPrompt() {
    extension_settings[settingsKey].prompt = DEFAULT_PROMPT;
    extension_settings[settingsKey].contextDepth = defaultSettings.contextDepth;
    $('#humanize_prompt').val(DEFAULT_PROMPT);
    $('#humanize_context_depth').val(defaultSettings.contextDepth);
    saveSettingsDebounced();
    toastr.success('Defaults restored', 'Humanize');
}

/**
 * Handle extension enable/disable toggle
 */
function onEnabledChange() {
    const enabled = $('#humanize_enabled').prop('checked');
    extension_settings[settingsKey].enabled = enabled;
    saveSettingsDebounced();

    if (enabled) {
        addButtonsToAllMessages();
    } else {
        removeAllButtons();
    }
}

/**
 * Initialize the extension
 */
jQuery(async () => {
    try {
        // Load settings HTML template
        const settingsHtml = await renderExtensionTemplateAsync(extensionName, 'settings');
        $('#extensions_settings2').append(settingsHtml);

        // Load settings
        loadSettings();

        // Event handlers for settings
        $('#humanize_enabled').on('change', onEnabledChange);

        $('#humanize_prompt').on('input', function () {
            extension_settings[settingsKey].prompt = $(this).val();
            saveSettingsDebounced();
        });

        $('#humanize_context_depth').on('input', function () {
            extension_settings[settingsKey].contextDepth = parseInt($(this).val()) || 0;
            saveSettingsDebounced();
        });

        $('#humanize_restore_default').on('click', restoreDefaultPrompt);

        // Register event listeners for messages
        eventSource.on(event_types.CHAT_CHANGED, () => {
            setTimeout(addButtonsToAllMessages, 500);
        });

        eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
            setTimeout(() => addHumanizeButton(messageId), 300);
        });

        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
            setTimeout(() => addHumanizeButton(messageId), 100);
        });

        // Initial button addition
        setTimeout(addButtonsToAllMessages, 1000);

        console.log('[Humanize] Extension loaded successfully');
    } catch (error) {
        console.error('[Humanize] Failed to initialize:', error);
    }
});
