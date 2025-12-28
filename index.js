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

const DEFAULT_PROMPT = `You are a writing improvement assistant. Rewrite the following message applying ALL these improvements:

=== 1. STORY & LOGIC ===
- Ensure cause-and-effect is logical
- Character actions must stem from established motivations
- No sudden personality shifts without cause
- No deus ex machina or convenient coincidences

=== 2. NPC PERCEPTION FIX ===
CRITICAL: Fix "telepathic" characters who unrealistically suspect secrets or hidden identities.
- NPCs must NOT intuit the protagonist's secrets, hidden powers, or special nature
- Unusual behavior should be explained with MUNDANE reasons:
  * "He's a prodigy" NOT "He must have lived before"
  * "She's eccentric" NOT "She's hiding something"
  * "Natural talent" NOT "There's something different about them"
- NPCs use their world's understanding, not meta-knowledge

=== 3. SHOW DON'T TELL ===
- Replace "was/felt" with action verbs
- Convert emotional labels to physical actions:
  * "He was scared" → "His hands trembled"
  * "She was angry" → "Her jaw clenched"
- Weave setting into action, not static description
- Use active voice

=== 4. DIALOGUE POLISH ===
- NO EXPOSITION DUMPS - characters don't lecture
- Add SUBTEXT - people deflect, use sarcasm, talk around issues
- DISTINCT VOICES - vary vocabulary and patterns per character
- Use contractions and fragments
- Remove filler: "I see", "Indeed", "Very well"
- Use "said" not "exclaimed/retorted/queried"

=== 5. PROSE CRAFT ===
- Vary sentence length (short punches, long flows)
- Cut filler, prefer strong verbs over adverbs
- Skip routine actions (opening doors, etc.)
- No cliché similes
- Remove vague "something" constructions
- Remove silence labels ("Silence fell")

=== 6. PACING ===
- Skip boring parts (travel, routine meals)
- Action scenes: short sentences, rapid exchanges
- Emotional scenes: slower, more sensory detail

=== 7. PITFALL FIXES ===
- No telepathic shortcuts
- No explaining the theme through dialogue
- No "complicated" or "unreadable" expressions
- No backstory dumps mid-emotion
- Ground emotion in physical action
- No on-the-nose dialogue ("You're afraid, aren't you?")

=== 8. STRONG ENDINGS ===
Remove weak endings like:
- "And that was enough"
- "Perhaps that was what it meant to..."
- "Things were about to change"
- Falling asleep endings
- Content smiling/nodding

Use strong endings:
- Mid-action cuts
- Revelations
- Decision points
- Dialogue hooks

=== 9. HUMANIZE (FINAL POLISH) ===
- Dialogue flows naturally with contractions and fragments
- Characters don't speak in perfect paragraphs
- Remove robotic responses
- Smooth out awkward phrasing

CONTEXT:
{{context}}

ORIGINAL MESSAGE TO REWRITE:
{{message}}

Apply ALL improvements and provide ONLY the rewritten message. No explanations.`;

const defaultSettings = {
    enabled: true,
    contextDepth: 3,
    prompt: ''
};

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

    // Build chat context
    const contextDepth = extension_settings[settingsKey].contextDepth || 3;
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

    // Get the prompt
    const promptTemplate = extension_settings[settingsKey].prompt || DEFAULT_PROMPT;
    const fullPrompt = promptTemplate
        .replace('{{context}}', contextString)
        .replace('{{message}}', originalContent);

    // Show processing toast
    toastr.info('Improving message...', 'Humanize', { timeOut: 0, extendedTimeOut: 0 });

    // Disable button during processing
    const button = $(`.humanize-btn[data-message-id="${messageId}"]`);
    button.addClass('disabled');

    console.log('[Humanize] Starting improvement...');
    console.log('[Humanize] Prompt length:', fullPrompt.length);
    console.log('[Humanize] Message length:', originalContent.length);
    console.log('[Humanize] Context length:', contextString.length);

    // Warn if prompt is very large
    if (fullPrompt.length > 50000) {
        console.warn('[Humanize] Warning: Prompt is very large, may take a while or fail');
    }

    try {
        console.log('[Humanize] Calling generateRaw...');
        const improvedText = await generateRaw({ prompt: fullPrompt, quietToLoud: false });
        console.log('[Humanize] generateRaw returned:', improvedText ? `${improvedText.length} chars` : 'null/undefined');

        toastr.clear();

        if (!improvedText || improvedText.trim() === '') {
            console.error('[Humanize] Empty or null response received');
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
        console.log('[Humanize] Message updated successfully');

        toastr.success('Message improved!', 'Humanize');
        button.removeClass('disabled');

    } catch (error) {
        console.error('[Humanize] Error caught:', error);
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

        console.log('[Humanize] Extension loaded successfully');
    } catch (error) {
        console.error('[Humanize] Failed to initialize:', error);
    }
});
