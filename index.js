import {
    extension_settings,
    getContext,
    renderExtensionTemplateAsync,
} from '../../../extensions.js';

import {
    eventSource,
    event_types,
    generateRaw,
    saveChatDebounced,
    saveSettingsDebounced,
    messageFormatting,
} from '../../../../script.js';

const extensionName = 'third-party/sillytavern-humanize';
const settingsKey = 'humanize';

// ============================================================================
// COMBINED IMPROVEMENT PROMPT - All rules in one API call
// ============================================================================

const DEFAULT_PROMPT = `Rewrite this message with these fixes:

1. HUMANIZE DIALOGUE: Make characters sound like real people. No robotic tone. No overcomplicated words. Use everyday language that normal people actually use. Include contractions, sentence fragments, and natural speech patterns.

2. HUMANIZE WRITING: Prose and narration must sound natural, not AI-generated. No purple prose. No clinical or data-like language. No thesaurus words. Avoid overcomplicated vocabulary. Write simply and clearly like a human author would.

3. LOGIC & COHERENCE: Ensure cause-effect makes sense. No sudden personality shifts. No contradictions. Events should flow naturally from what came before.

4. NPC PERCEPTION: NPCs must NOT magically sense secrets, hidden powers, or things they couldn't possibly know. Use mundane explanations only - "talented" not "there's something about you", "prodigy" not "lived before", "eccentric" not "hiding something". No telepathic shortcuts.

CONTEXT:
{{context}}

MESSAGE:
{{message}}

Rewrite applying ALL fixes. Output ONLY the improved message.`;

const defaultSettings = {
    enabled: true,
    autoHumanize: false,
    contextDepth: 3,
    prompt: ''
};

// ============================================================================
// LOGGING - Console + persistent toastr popups (click to dismiss)
// ============================================================================

function log(message, type = 'info') {
    // Console logging
    if (type === 'error') {
        console.error('[Humanize]', message);
    } else if (type === 'warn') {
        console.warn('[Humanize]', message);
    } else {
        console.log('[Humanize]', message);
    }

    // Persistent toastr - stays until clicked
    const toastrOptions = { timeOut: 0, extendedTimeOut: 0, closeButton: true, tapToDismiss: true };

    if (type === 'error') {
        toastr.error(message, 'Humanize', toastrOptions);
    } else if (type === 'warn') {
        toastr.warning(message, 'Humanize', toastrOptions);
    } else if (type === 'success') {
        toastr.success(message, 'Humanize', toastrOptions);
    } else {
        toastr.info(message, 'Humanize', toastrOptions);
    }
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

function loadSettings() {
    extension_settings[settingsKey] = extension_settings[settingsKey] || {};

    if (Object.keys(extension_settings[settingsKey]).length === 0) {
        Object.assign(extension_settings[settingsKey], defaultSettings);
    }

    if (extension_settings[settingsKey].contextDepth === undefined) {
        extension_settings[settingsKey].contextDepth = defaultSettings.contextDepth;
    }

    if (extension_settings[settingsKey].autoHumanize === undefined) {
        extension_settings[settingsKey].autoHumanize = defaultSettings.autoHumanize;
    }

    // Update UI
    $('#humanize_enabled').prop('checked', extension_settings[settingsKey].enabled);
    $('#humanize_auto').prop('checked', extension_settings[settingsKey].autoHumanize);
    $('#humanize_context_depth').val(extension_settings[settingsKey].contextDepth);
    $('#humanize_prompt').val(extension_settings[settingsKey].prompt || DEFAULT_PROMPT);
}

// ============================================================================
// CORE IMPROVEMENT FUNCTION
// ============================================================================

async function improveMessage(messageId) {
    const context = getContext();
    const chat = context.chat;

    if (!chat || !chat[messageId]) {
        toastr.error('Message not found', 'Humanize');
        return;
    }

    const message = chat[messageId];

    if (message.is_user) {
        toastr.warning('Can only improve AI messages', 'Humanize');
        return;
    }

    const originalContent = message.mes;

    if (!originalContent || originalContent.trim() === '') {
        toastr.warning('Message is empty', 'Humanize');
        return;
    }

    // Get the prompt template
    const promptTemplate = extension_settings[settingsKey].prompt || DEFAULT_PROMPT;

    // Build chat context
    const contextDepth = extension_settings[settingsKey].contextDepth || 3;
    const startIndex = Math.max(0, messageId - contextDepth);
    let contextMessages = [];

    for (let i = startIndex; i < messageId; i++) {
        const msg = chat[i];
        if (msg && msg.mes) {
            const name = msg.is_user ? 'User' : (msg.name || 'Character');
            const entry = `${name}: ${msg.mes}`;
            contextMessages.push(entry);
        }
    }

    const contextString = contextMessages.length > 0
        ? contextMessages.join('\n\n')
        : '(No previous context)';

    // Build full prompt
    const fullPrompt = promptTemplate
        .replace('{{context}}', contextString)
        .replace('{{message}}', originalContent);

    // Disable button during processing
    const button = $(`.humanize-btn[data-message-id="${messageId}"]`);
    button.addClass('disabled');

    log('Starting improvement...');

    try {
        log('Calling API...');
        const improvedText = await generateRaw({ prompt: fullPrompt, quietToLoud: false });

        if (!improvedText || improvedText.trim() === '') {
            log('Empty response. Try reducing context depth.', 'error');
            button.removeClass('disabled');
            return;
        }

        log(`API returned ${improvedText.length} chars`);

        // Update the message in chat
        chat[messageId].mes = improvedText;

        // Update the displayed message
        const messageBlock = $(`.mes[mesid="${messageId}"]`);
        if (messageBlock.length) {
            const mesTextElement = messageBlock.find('.mes_text');
            if (mesTextElement.length) {
                const formattedText = messageFormatting(
                    improvedText,
                    message.name,
                    message.is_system,
                    message.is_user,
                    messageId
                );
                mesTextElement.html(formattedText);
            }
        }

        saveChatDebounced();
        log('Message improved!', 'success');
        button.removeClass('disabled');

    } catch (error) {
        log(`Error: ${error.message || error}`, 'error');
        button.removeClass('disabled');
    }
}

// ============================================================================
// UI BUTTON MANAGEMENT
// ============================================================================

function addImproveButton(messageId) {
    if (!extension_settings[settingsKey]?.enabled) return;

    const messageBlock = $(`.mes[mesid="${messageId}"]`);
    if (messageBlock.length === 0) return;

    const isUser = messageBlock.attr('is_user') === 'true';
    if (isUser) return;

    if (messageBlock.find('.humanize-btn').length > 0) return;

    const extraButtons = messageBlock.find('.extraMesButtons');
    if (extraButtons.length === 0) return;

    const button = $(`<div class="humanize-btn mes_button fa-solid fa-wand-magic-sparkles interactable" title="Improve message (all fixes in one click)" data-message-id="${messageId}"></div>`);

    button.on('click', function(e) {
        e.stopPropagation();
        if ($(this).hasClass('disabled')) return;
        const msgId = parseInt($(this).attr('data-message-id'));
        improveMessage(msgId);
    });

    extraButtons.prepend(button);
}

function addButtonsToAllMessages() {
    if (!extension_settings[settingsKey]?.enabled) return;

    $('.mes').each(function() {
        const messageId = parseInt($(this).attr('mesid'));
        if (!isNaN(messageId)) {
            addImproveButton(messageId);
        }
    });
}

function removeAllButtons() {
    $('.humanize-btn').remove();
}

// ============================================================================
// SETTINGS EVENT HANDLERS
// ============================================================================

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

function onAutoHumanizeChange() {
    const autoHumanize = $('#humanize_auto').prop('checked');
    extension_settings[settingsKey].autoHumanize = autoHumanize;
    saveSettingsDebounced();

    if (autoHumanize) {
        toastr.info('New AI messages will be automatically humanized', 'Humanize');
    }
}

function onPromptChange() {
    extension_settings[settingsKey].prompt = $('#humanize_prompt').val();
    saveSettingsDebounced();
}

function restoreDefaultPrompt() {
    extension_settings[settingsKey].prompt = '';
    $('#humanize_prompt').val(DEFAULT_PROMPT);
    saveSettingsDebounced();
    toastr.success('Default prompt restored', 'Humanize');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

jQuery(async () => {
    try {
        const settingsHtml = await renderExtensionTemplateAsync(extensionName, 'settings');
        $('#extensions_settings2').append(settingsHtml);

        loadSettings();

        // Event handlers
        $('#humanize_enabled').on('change', onEnabledChange);
        $('#humanize_auto').on('change', onAutoHumanizeChange);
        $('#humanize_prompt').on('input', onPromptChange);
        $('#humanize_context_depth').on('input', function() {
            extension_settings[settingsKey].contextDepth = parseInt($(this).val()) || 0;
            saveSettingsDebounced();
        });
        $('#humanize_restore_default').on('click', restoreDefaultPrompt);

        // Register event listeners
        eventSource.on(event_types.CHAT_CHANGED, () => {
            setTimeout(addButtonsToAllMessages, 500);
        });

        eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
            setTimeout(() => addImproveButton(messageId), 300);
        });

        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
            setTimeout(() => {
                addImproveButton(messageId);

                // Auto-humanize if enabled
                if (extension_settings[settingsKey]?.autoHumanize && extension_settings[settingsKey]?.enabled) {
                    log('Auto-humanizing message...');
                    improveMessage(messageId);
                }
            }, 100);
        });

        setTimeout(addButtonsToAllMessages, 1000);

        log('Extension loaded successfully', 'success');
    } catch (error) {
        console.error('[Humanize] Failed to initialize:', error);
    }
});
