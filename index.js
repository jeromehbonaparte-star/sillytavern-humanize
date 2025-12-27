import {
    extension_settings,
    getContext,
    renderExtensionTemplateAsync,
    saveSettingsDebounced,
} from '../../../extensions.js';

import {
    eventSource,
    event_types,
    generateQuietPrompt,
    saveChatDebounced,
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

    // Get the prompt template
    const promptTemplate = extension_settings[extensionName].prompt || DEFAULT_PROMPT;
    const fullPrompt = promptTemplate.replace('{{message}}', originalContent);

    // Show processing toast
    toastr.info('Rewriting message...', 'Humanize', { timeOut: 0, extendedTimeOut: 0 });

    try {
        // Disable the humanize button during processing
        const button = $(`.humanize-msg-btn[data-message-id="${messageId}"]`);
        button.addClass('disabled');

        // Generate the humanized response
        const humanizedText = await generateQuietPrompt(fullPrompt, false, false);

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
    if (!extension_settings[extensionName]?.enabled) return;

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
    if (!extension_settings[extensionName]?.enabled) return;

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
    extension_settings[extensionName].prompt = DEFAULT_PROMPT;
    $('#humanize_prompt').val(DEFAULT_PROMPT);
    saveSettingsDebounced();
    toastr.success('Default prompt restored', 'Humanize');
}

/**
 * Handle extension enable/disable toggle
 */
function onEnabledChange() {
    const enabled = $('#humanize_enabled').prop('checked');
    extension_settings[extensionName].enabled = enabled;
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
            extension_settings[extensionName].prompt = $(this).val();
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
