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

1. LOGIC: Ensure cause-effect, no sudden personality shifts, no deus ex machina
2. NPC PERCEPTION: NPCs must NOT sense secrets/hidden powers. Use mundane explanations ("prodigy" not "lived before", "eccentric" not "hiding something")
3. SHOW DON'T TELL: Replace "was scared/angry" with actions ("hands trembled", "jaw clenched"). Use active voice.
4. DIALOGUE: No exposition dumps. Add subtext. Distinct voices. Use contractions. Remove "I see/Indeed/Very well". Use "said".
5. PROSE: Vary sentence length. Cut filler. Strong verbs. No clichés. No vague "something". No "silence fell".
6. PACING: Skip boring parts. Action=short sentences. Emotion=sensory detail.
7. PITFALLS: No telepathic shortcuts. No theme explanations. No "complicated expression". Ground emotion in action.
8. ENDINGS: Remove "And that was enough"/"Things were about to change"/falling asleep. Use hooks/revelations/mid-action cuts.
9. HUMANIZE: Natural dialogue with contractions/fragments. No robotic speech.

CONTEXT:
{{context}}

MESSAGE:
{{message}}

Rewrite applying ALL fixes. Output ONLY the improved message.`;

const defaultSettings = {
    enabled: true,
    contextDepth: 3,
    prompt: ''
};

// Max characters for the entire prompt (roughly 8k tokens)
const MAX_PROMPT_CHARS = 32000;

// ============================================================================
// LOGGING - Writes to both console and UI panel
// ============================================================================

function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}]`;

    // Console logging
    if (type === 'error') {
        console.error('[Humanize]', message);
    } else if (type === 'warn') {
        console.warn('[Humanize]', message);
    } else {
        console.log('[Humanize]', message);
    }

    // UI logging
    const logPanel = $('#humanize_log');
    if (logPanel.length) {
        const color = type === 'error' ? '#ff6b6b' : type === 'warn' ? '#ffd93d' : type === 'success' ? '#6bcb77' : '#ccc';
        logPanel.append(`<div style="color: ${color}">${prefix} ${message}</div>`);
        logPanel.scrollTop(logPanel[0].scrollHeight);
    }
}

function clearLog() {
    $('#humanize_log').empty();
    log('Log cleared', 'info');
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

    // Update UI
    $('#humanize_enabled').prop('checked', extension_settings[settingsKey].enabled);
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

    // Calculate available space for context (total - template - message - buffer)
    const templateSize = promptTemplate.replace('{{context}}', '').replace('{{message}}', '').length;
    const messageSize = originalContent.length;
    const availableForContext = MAX_PROMPT_CHARS - templateSize - messageSize - 500; // 500 char buffer

    // Build chat context with size limit
    const contextDepth = extension_settings[settingsKey].contextDepth || 3;
    const startIndex = Math.max(0, messageId - contextDepth);
    let contextMessages = [];
    let contextSize = 0;

    for (let i = startIndex; i < messageId; i++) {
        const msg = chat[i];
        if (msg && msg.mes) {
            const name = msg.is_user ? 'User' : (msg.name || 'Character');
            const entry = `${name}: ${msg.mes}`;

            // Check if adding this would exceed limit
            if (contextSize + entry.length > availableForContext && availableForContext > 0) {
                log('Context truncated to fit token limit', 'warn');
                break;
            }

            contextMessages.push(entry);
            contextSize += entry.length + 2; // +2 for \n\n
        }
    }

    const contextString = contextMessages.length > 0
        ? contextMessages.join('\n\n')
        : '(No previous context)';

    // Build full prompt
    const fullPrompt = promptTemplate
        .replace('{{context}}', contextString)
        .replace('{{message}}', originalContent);

    // Show processing toast
    toastr.info('Improving message...', 'Humanize', { timeOut: 0, extendedTimeOut: 0 });

    // Disable button during processing
    const button = $(`.humanize-btn[data-message-id="${messageId}"]`);
    button.addClass('disabled');

    const estimatedTokens = Math.ceil(fullPrompt.length / 4);
    log('Starting improvement...');
    log(`Prompt: ${fullPrompt.length} chars (~${estimatedTokens} tokens)`);
    log(`Message: ${originalContent.length} chars`);
    log(`Context: ${contextString.length} chars`);

    // Warn if still very large
    if (estimatedTokens > 10000) {
        log(`Warning: ~${estimatedTokens} tokens is large, may be slow`, 'warn');
        toastr.warning('Large message (~' + estimatedTokens + ' tokens), this may take a while...', 'Humanize');
    }

    try {
        log('Calling API...');
        const improvedText = await generateRaw({ prompt: fullPrompt, quietToLoud: false });
        log(`API returned: ${improvedText ? improvedText.length + ' chars' : 'null/undefined'}`, improvedText ? 'info' : 'error');

        toastr.clear();

        if (!improvedText || improvedText.trim() === '') {
            log('Empty or null response received', 'error');
            toastr.error('Empty response received. Try reducing context depth.', 'Humanize');
            button.removeClass('disabled');
            return;
        }

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
        log('Message improved successfully!', 'success');

        toastr.success('Message improved!', 'Humanize');
        button.removeClass('disabled');

    } catch (error) {
        log(`Error: ${error.message || error}`, 'error');
        toastr.clear();
        toastr.error('Error: ' + (error.message || 'Unknown error'), 'Humanize');
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
        $('#humanize_prompt').on('input', onPromptChange);
        $('#humanize_context_depth').on('input', function() {
            extension_settings[settingsKey].contextDepth = parseInt($(this).val()) || 0;
            saveSettingsDebounced();
        });
        $('#humanize_restore_default').on('click', restoreDefaultPrompt);
        $('#humanize_clear_log').on('click', clearLog);

        // Register event listeners
        eventSource.on(event_types.CHAT_CHANGED, () => {
            setTimeout(addButtonsToAllMessages, 500);
        });

        eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
            setTimeout(() => addImproveButton(messageId), 300);
        });

        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
            setTimeout(() => addImproveButton(messageId), 100);
        });

        setTimeout(addButtonsToAllMessages, 1000);

        log('Extension loaded successfully', 'success');
    } catch (error) {
        console.error('[Humanize] Failed to initialize:', error);
    }
});
