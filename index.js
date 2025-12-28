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

// Track if a "Run All" operation is in progress and can be cancelled
let runAllInProgress = false;
let runAllCancelled = false;

// ============================================================================
// IMPROVEMENT PACKS - Combined prompts for efficiency
// ============================================================================

const IMPROVEMENT_PACKS = {
    storyLogic: {
        name: 'Story & Logic',
        icon: 'fa-diagram-project',
        description: 'Fix plot coherence and stop telepathic NPCs',
        prompt: `Rewrite this message applying the following improvements:

=== PLOT COHERENCE ===
- Ensure cause-and-effect is logical
- Character actions must stem from established motivations
- No sudden personality shifts without cause
- No deus ex machina or convenient coincidences
- Consequences should follow naturally from previous events
- What characters want must cost them something to pursue

=== NPC PERCEPTION FIX ===
CRITICAL: Characters are often written as "telepathic" - suspecting secrets, hidden identities, or special origins without realistic justification. This breaks immersion.

Fix this by:
- NPCs must NOT intuit the protagonist's secrets, hidden powers, or special nature
- Unusual behavior should be explained with MUNDANE reasons:
  * "He's a prodigy" not "He must have lived before"
  * "She's eccentric" not "She's hiding something"
  * "Well-educated" not "Suspiciously knowledgeable"
  * "Natural talent" not "There's something different about them"
- NPCs operate on LOCAL, SETTING-SPECIFIC common knowledge only
- No character should be inexplicably suspicious or perceptive
- Trust must be earned through actions, but distrust needs CONCRETE reasons
- If a character uses unusual abilities, NPCs categorize it using THEIR world's understanding

CONTEXT:
{{context}}

ORIGINAL MESSAGE TO REWRITE:
{{message}}

Apply ALL the above rules and provide ONLY the rewritten message, no explanations.`
    },

    proseStyle: {
        name: 'Prose & Style',
        icon: 'fa-pen-fancy',
        description: 'Transform prose with showing, dialogue, rhythm, and pacing',
        prompt: `Rewrite this message applying the following improvements:

=== SHOW DON'T TELL ===
- Replace weak state-of-being verbs (is, was, felt) with action verbs
- Convert emotional labels into physical actions:
  * "He was scared" → "His hands trembled"
  * "She was angry" → "Her jaw clenched"
  * "The room was tense" → "No one moved. Someone's chair creaked."
- Weave setting details into action, not static description blocks
- Appeal to senses naturally: sight, sound, smell, taste, touch
- Trust the reader - don't over-explain what actions already imply
- Use active voice instead of passive

=== DIALOGUE POLISH ===
- NO EXPOSITION DUMPS: Characters must not lecture or explain backstory directly
  * BAD: "I chose her because she is brave and pragmatic."
  * GOOD: "She stood up to her family. That took guts. I need that."
- Add SUBTEXT: People rarely say what they mean - they deflect, use sarcasm, talk around issues
- DISTINCT VOICES: Each character should sound different (vocabulary, sentence length, speech patterns)
- Use contractions and fragments - real speech is messy
- VARY RESPONSES: Not every line needs a direct answer. Characters can ignore questions, answer with actions, deflect, or counter-question
- Remove filler responses: "I see", "Indeed", "Very well", "Understood"
- Use simple "said" for attribution, not "exclaimed/retorted/queried"

=== PROSE CRAFT ===
- SENTENCE RHYTHM: Vary sentence length deliberately. Short sentences punch. Longer ones flow.
- ECONOMY: Every sentence earns its place. Cut filler. Prefer strong verbs over adverbs.
- SKIP OBVIOUS: Don't describe routine actions (opening doors, pressing buttons). Jump to impact.
- FRESH IMAGERY: No cliché similes ("like a shark", "cold as ice"). Create specific imagery.
- Remove vague "something" constructions:
  * BAD: "Something flickered across her face"
  * GOOD: "Her jaw tightened"
- Remove silence labels:
  * BAD: "Silence stretched between them"
  * GOOD: Show discomfort through action

=== PACING FIX ===
- SKIP THE BORING: Jump over travel, routine meals, uneventful moments. Start scenes late.
- ACTION SEQUENCES: Short sentences, rapid exchanges, minimal description
- EMOTIONAL SCENES: Slower, more sensory detail, longer beats
- BREATHING ROOM: After intensity, allow brief quiet before next escalation
- Every scene should raise a question the reader wants answered
- Don't pad length - end at compelling moments

CONTEXT:
{{context}}

ORIGINAL MESSAGE TO REWRITE:
{{message}}

Apply ALL the above rules and provide ONLY the rewritten message, no explanations.`
    },

    polishEndings: {
        name: 'Polish & Endings',
        icon: 'fa-flag-checkered',
        description: 'Fix common pitfalls and strengthen scene endings',
        prompt: `Rewrite this message applying the following improvements:

=== PITFALL CHECKER ===
Fix these common writing problems:

1. NO TELEPATHIC SHORTCUTS - Don't use psychic bonds to tell what others feel. Show through behavior.

2. NO EXPLAINING THE THEME - Characters shouldn't summarize the story's point.
   BAD: "He offered a solution that benefits everyone except Riser's wounded pride."

3. "COMPLICATED" IS LAZY - Never describe expressions as "complicated" or "unreadable"
   BAD: "Her expression was complicated"
   GOOD: "A smile that didn't reach her eyes"

4. NO BACKSTORY MID-EMOTION - Don't interrupt emotional moments with memory explanations
   BAD: "She looked afraid—the same fear I'd seen when her father died."
   GOOD: Just show the fear through action.

5. GROUND EMOTION IN ACTION - Include physical behavior, not just similes
   BAD: "Her discomfort radiated like heat"
   GOOD: "She shifted her weight, fingers twisting her sleeve."

6. NO ON-THE-NOSE DIALOGUE:
   BANNED: "You did this for me." / "You're afraid, aren't you?" / "This is about X, isn't it?"
   Let actions and silence convey understanding.

7. NO VAGUE "SOMETHING":
   BANNED: "something flickered across her face", "something shifted between them"
   Name the SPECIFIC action.

8. NO SILENCE LABELS:
   BANNED: "Silence fell", "The room went quiet"
   Show characters noticing it through action.

=== CHAPTER/SCENE ENDING ===
Strengthen the ending of this message:

BANNED ENDING PATTERNS (remove these):
- Reflective summaries: "And that was enough." / "For now, that would have to do."
- Philosophical musings: "Perhaps that was what it meant to be..."
- Stating the obvious: "Things were about to change."
- Falling asleep: "And with that thought, sleep claimed me."
- Content smiling/nodding: "I smiled to myself."

USE STRONG ENDINGS:
- MID-ACTION: Cut during a fight, chase, or confrontation
- REVELATION: A secret exposed, new information that reframes everything
- DECISION POINT: Character commits to an irreversible choice
- ARRIVAL/DEPARTURE: Someone appears unexpectedly or leaves with unfinished business
- DIALOGUE HOOK: A line that raises questions: "There's something you need to know."
- THREAT: Danger announced or glimpsed

CONTEXT:
{{context}}

ORIGINAL MESSAGE TO REWRITE:
{{message}}

Apply ALL the above rules and provide ONLY the rewritten message, no explanations.`
    },

    humanize: {
        name: 'Humanize',
        icon: 'fa-wand-magic-sparkles',
        description: 'Final pass - make dialogue natural and human-like',
        prompt: `This is the FINAL polishing step. Rewrite the message to make it sound natural and human-like.

GOALS:
- Dialogue should flow naturally with contractions, fragments, and realistic speech patterns
- Characters should not speak in perfect paragraphs
- Remove any remaining robotic or overly logical responses
- Keep the same content and meaning, just make it sound like real people talking
- Smooth out any awkward phrasing from previous edits
- Ensure the overall flow reads naturally

CONTEXT:
{{context}}

ORIGINAL MESSAGE TO REWRITE:
{{message}}

Provide ONLY the rewritten message, no explanations.`
    }
};

// Pack execution order
const PACK_ORDER = ['storyLogic', 'proseStyle', 'polishEndings', 'humanize'];

const defaultSettings = {
    enabled: true,
    selectedPack: 'storyLogic',
    contextDepth: 3,
    prompts: {} // Will store custom prompts per pack
};

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

function loadSettings() {
    extension_settings[settingsKey] = extension_settings[settingsKey] || {};

    if (Object.keys(extension_settings[settingsKey]).length === 0) {
        Object.assign(extension_settings[settingsKey], defaultSettings);
    }

    // Ensure all fields exist
    if (extension_settings[settingsKey].contextDepth === undefined) {
        extension_settings[settingsKey].contextDepth = defaultSettings.contextDepth;
    }
    if (!extension_settings[settingsKey].selectedPack) {
        extension_settings[settingsKey].selectedPack = defaultSettings.selectedPack;
    }
    if (!extension_settings[settingsKey].prompts) {
        extension_settings[settingsKey].prompts = {};
    }

    // Update UI
    $('#humanize_enabled').prop('checked', extension_settings[settingsKey].enabled);
    $('#humanize_context_depth').val(extension_settings[settingsKey].contextDepth);
    $('#humanize_pack_select').val(extension_settings[settingsKey].selectedPack);

    // Load the prompt for selected pack
    updatePromptDisplay();
}

function updatePromptDisplay() {
    const selectedPack = extension_settings[settingsKey].selectedPack;
    const customPrompt = extension_settings[settingsKey].prompts[selectedPack];
    const defaultPrompt = IMPROVEMENT_PACKS[selectedPack]?.prompt || '';

    $('#humanize_prompt').val(customPrompt || defaultPrompt);
    $('#humanize_pack_description').text(IMPROVEMENT_PACKS[selectedPack]?.description || '');
}

// ============================================================================
// CORE IMPROVEMENT FUNCTION
// ============================================================================

/**
 * Apply an improvement pack to a message
 * @param {number} messageId - The message index to improve
 * @param {string|null} packKey - The pack key, or null to use selected pack
 * @param {object} options - Options for the improvement
 * @param {boolean} options.silent - If true, don't show individual toasts (for Run All mode)
 * @returns {Promise<{success: boolean, error?: string}>} Result of the improvement
 */
async function applyPack(messageId, packKey = null, options = {}) {
    const { silent = false } = options;
    const context = getContext();
    const chat = context.chat;

    if (!chat || !chat[messageId]) {
        if (!silent) toastr.error('Message not found', 'Humanize');
        return { success: false, error: 'Message not found' };
    }

    const message = chat[messageId];

    if (message.is_user) {
        if (!silent) toastr.warning('Can only improve AI messages', 'Humanize');
        return { success: false, error: 'Can only improve AI messages' };
    }

    const originalContent = message.mes;

    if (!originalContent || originalContent.trim() === '') {
        if (!silent) toastr.warning('Message is empty', 'Humanize');
        return { success: false, error: 'Message is empty' };
    }

    // Use provided pack or fall back to selected pack
    const activePackKey = packKey || extension_settings[settingsKey].selectedPack;
    const packInfo = IMPROVEMENT_PACKS[activePackKey];

    if (!packInfo) {
        if (!silent) toastr.error('Unknown improvement pack', 'Humanize');
        return { success: false, error: 'Unknown improvement pack' };
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

    // Get the prompt (custom or default)
    const customPrompt = extension_settings[settingsKey].prompts[activePackKey];
    const promptTemplate = customPrompt || packInfo.prompt;
    const fullPrompt = promptTemplate
        .replace('{{context}}', contextString)
        .replace('{{message}}', originalContent);

    // Show processing toast (unless silent)
    if (!silent) {
        toastr.info(`Applying ${packInfo.name}...`, 'Humanize', { timeOut: 0, extendedTimeOut: 0 });
    }

    // Disable buttons during processing
    const button = $(`.improve-msg-btn[data-message-id="${messageId}"]`);
    const dropdownBtn = $(`.improve-dropdown-btn[data-message-id="${messageId}"]`);
    button.addClass('disabled');
    dropdownBtn.addClass('disabled');

    console.log(`[Humanize] Starting ${packInfo.name}...`);
    console.log('[Humanize] Prompt length:', fullPrompt.length);

    try {
        const improvedText = await generateRaw({ prompt: fullPrompt, quietToLoud: false });

        if (!silent) toastr.clear();

        if (!improvedText || improvedText.trim() === '') {
            if (!silent) toastr.error('Empty response received. Try reducing context depth.', 'Humanize');
            button.removeClass('disabled');
            dropdownBtn.removeClass('disabled');
            return { success: false, error: 'Empty response received' };
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

        if (!silent) toastr.success(`${packInfo.name} applied!`, 'Humanize');
        button.removeClass('disabled');
        dropdownBtn.removeClass('disabled');

        return { success: true };

    } catch (error) {
        console.error('[Humanize] Error:', error);
        if (!silent) {
            toastr.clear();
            toastr.error('Error: ' + (error.message || 'Unknown error'), 'Humanize');
        }
        button.removeClass('disabled');
        dropdownBtn.removeClass('disabled');
        return { success: false, error: error.message || 'Unknown error' };
    }
}

/**
 * Run all packs on a message in sequence
 * @param {number} messageId - The message index to improve
 */
async function runAllPacks(messageId) {
    if (runAllInProgress) {
        toastr.warning('Run All already in progress', 'Humanize');
        return;
    }

    const totalSteps = PACK_ORDER.length;

    runAllInProgress = true;
    runAllCancelled = false;

    // Disable all buttons
    const button = $(`.improve-msg-btn[data-message-id="${messageId}"]`);
    const dropdownBtn = $(`.improve-dropdown-btn[data-message-id="${messageId}"]`);
    button.addClass('disabled');
    dropdownBtn.addClass('disabled');

    console.log(`[Humanize] Starting Run All Packs (${totalSteps} packs)...`);

    // Show initial progress toast
    toastr.info(`Run All: Starting (0/${totalSteps})...`, 'Humanize', {
        timeOut: 0,
        extendedTimeOut: 0,
        tapToDismiss: false,
        onclick: () => {
            runAllCancelled = true;
            toastr.clear();
            toastr.warning('Cancelling Run All...', 'Humanize');
        }
    });

    let completedSteps = 0;
    let errors = [];

    for (let i = 0; i < PACK_ORDER.length; i++) {
        // Check for cancellation
        if (runAllCancelled) {
            toastr.clear();
            toastr.warning(`Run All cancelled after ${completedSteps}/${totalSteps} packs`, 'Humanize');
            break;
        }

        const packKey = PACK_ORDER[i];
        const packInfo = IMPROVEMENT_PACKS[packKey];

        // Update progress toast
        toastr.clear();
        toastr.info(`Run All: ${packInfo.name} (${i + 1}/${totalSteps})...\n<small>Click to cancel</small>`, 'Humanize', {
            timeOut: 0,
            extendedTimeOut: 0,
            tapToDismiss: false,
            onclick: () => {
                runAllCancelled = true;
                toastr.clear();
                toastr.warning('Cancelling Run All...', 'Humanize');
            }
        });

        console.log(`[Humanize] Run All: Pack ${i + 1}/${totalSteps} - ${packInfo.name}`);

        const result = await applyPack(messageId, packKey, { silent: true });

        if (result.success) {
            completedSteps++;
        } else {
            errors.push(`${packInfo.name}: ${result.error}`);
            console.warn(`[Humanize] Run All: ${packInfo.name} failed - ${result.error}`);
            // Continue with next pack despite error
        }

        // Small delay between packs to avoid overwhelming the API
        if (i < PACK_ORDER.length - 1 && !runAllCancelled) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Clear progress toast
    toastr.clear();

    // Show final result
    runAllInProgress = false;

    if (runAllCancelled) {
        // Already showed cancellation message
    } else if (errors.length === 0) {
        toastr.success(`Run All complete! All ${totalSteps} packs applied.`, 'Humanize');
    } else if (completedSteps > 0) {
        toastr.warning(`Run All: ${completedSteps}/${totalSteps} packs applied.\n${errors.length} errors occurred.`, 'Humanize');
        console.warn('[Humanize] Run All errors:', errors);
    } else {
        toastr.error('Run All failed - no packs could be applied', 'Humanize');
    }

    // Re-enable buttons
    button.removeClass('disabled');
    dropdownBtn.removeClass('disabled');
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

    if (messageBlock.find('.improve-msg-btn').length > 0) return;

    const extraButtons = messageBlock.find('.extraMesButtons');
    if (extraButtons.length === 0) return;

    // Create container for button + dropdown
    const buttonContainer = $(`<div class="improve-btn-container" style="position: relative; display: inline-flex;"></div>`);

    // Main button (uses selected pack)
    const selectedPack = extension_settings[settingsKey].selectedPack;
    const packInfo = IMPROVEMENT_PACKS[selectedPack];
    const mainButton = $(`<div class="improve-msg-btn mes_button fa-solid ${packInfo?.icon || 'fa-wand-magic-sparkles'} interactable" title="${packInfo?.name || 'Improve'}: ${packInfo?.description || ''}" data-message-id="${messageId}"></div>`);

    // Dropdown toggle button
    const dropdownBtn = $(`<div class="improve-dropdown-btn mes_button fa-solid fa-caret-down interactable" title="Select improvement pack" data-message-id="${messageId}" style="font-size: 0.7em; margin-left: -2px;"></div>`);

    // Dropdown menu
    const dropdownMenu = $(`<div class="improve-dropdown-menu" style="display: none;"></div>`);

    // Add "Run All Packs" option at the top
    const runAllItem = $(`<div class="improve-dropdown-item improve-run-all" data-message-id="${messageId}">
        <i class="fa-solid fa-forward"></i> <b>Run All Packs (1→4)</b>
    </div>`);
    runAllItem.on('click', function(e) {
        e.stopPropagation();
        const msgId = $(this).data('message-id');
        dropdownMenu.hide();
        runAllPacks(msgId);
    });
    dropdownMenu.append(runAllItem);

    // Add separator
    dropdownMenu.append($('<div class="improve-dropdown-separator"></div>'));

    // Add all packs to dropdown
    let packNum = 1;
    for (const packKey of PACK_ORDER) {
        const info = IMPROVEMENT_PACKS[packKey];
        const item = $(`<div class="improve-dropdown-item" data-pack="${packKey}" data-message-id="${messageId}">
            <i class="fa-solid ${info.icon}"></i> ${packNum}. ${info.name}
        </div>`);
        item.on('click', function(e) {
            e.stopPropagation();
            const pack = $(this).data('pack');
            const msgId = $(this).data('message-id');
            dropdownMenu.hide();
            applyPack(msgId, pack);
        });
        dropdownMenu.append(item);
        packNum++;
    }

    // Main button click
    mainButton.on('click', function(e) {
        e.stopPropagation();
        if ($(this).hasClass('disabled')) return;
        const msgId = parseInt($(this).data('message-id'));
        applyPack(msgId);
    });

    // Dropdown toggle click
    dropdownBtn.on('click', function(e) {
        e.stopPropagation();
        if ($(this).hasClass('disabled')) return;

        // Hide all other dropdowns
        $('.improve-dropdown-menu').not(dropdownMenu).hide();

        // Toggle this dropdown
        dropdownMenu.toggle();
    });

    buttonContainer.append(mainButton);
    buttonContainer.append(dropdownBtn);
    buttonContainer.append(dropdownMenu);
    extraButtons.prepend(buttonContainer);
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
    $('.improve-btn-container').remove();
}

function updateAllButtonIcons() {
    const selectedPack = extension_settings[settingsKey].selectedPack;
    const packInfo = IMPROVEMENT_PACKS[selectedPack];

    $('.improve-msg-btn').each(function() {
        // Remove all fa- classes except fa-solid
        $(this).removeClass(function(index, className) {
            return (className.match(/(^|\s)fa-(?!solid)\S+/g) || []).join(' ');
        });
        $(this).addClass(packInfo?.icon || 'fa-wand-magic-sparkles');
        $(this).attr('title', `${packInfo?.name || 'Improve'}: ${packInfo?.description || ''}`);
    });
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

function onPackChange() {
    const selectedPack = $('#humanize_pack_select').val();
    extension_settings[settingsKey].selectedPack = selectedPack;
    saveSettingsDebounced();
    updatePromptDisplay();
    updateAllButtonIcons();
}

function onPromptChange() {
    const selectedPack = extension_settings[settingsKey].selectedPack;
    const newPrompt = $('#humanize_prompt').val();

    // Only save if different from default
    if (newPrompt !== IMPROVEMENT_PACKS[selectedPack]?.prompt) {
        extension_settings[settingsKey].prompts[selectedPack] = newPrompt;
    } else {
        delete extension_settings[settingsKey].prompts[selectedPack];
    }
    saveSettingsDebounced();
}

function restoreDefaultPrompt() {
    const selectedPack = extension_settings[settingsKey].selectedPack;
    delete extension_settings[settingsKey].prompts[selectedPack];
    $('#humanize_prompt').val(IMPROVEMENT_PACKS[selectedPack]?.prompt || '');
    saveSettingsDebounced();
    toastr.success(`Default prompt restored for ${IMPROVEMENT_PACKS[selectedPack]?.name}`, 'Humanize');
}

function restoreAllDefaults() {
    extension_settings[settingsKey].prompts = {};
    extension_settings[settingsKey].contextDepth = defaultSettings.contextDepth;
    extension_settings[settingsKey].selectedPack = defaultSettings.selectedPack;

    $('#humanize_context_depth').val(defaultSettings.contextDepth);
    $('#humanize_pack_select').val(defaultSettings.selectedPack);
    updatePromptDisplay();
    updateAllButtonIcons();
    saveSettingsDebounced();
    toastr.success('All defaults restored', 'Humanize');
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
        $('#humanize_pack_select').on('change', onPackChange);
        $('#humanize_prompt').on('input', onPromptChange);
        $('#humanize_context_depth').on('input', function() {
            extension_settings[settingsKey].contextDepth = parseInt($(this).val()) || 0;
            saveSettingsDebounced();
        });
        $('#humanize_restore_default').on('click', restoreDefaultPrompt);
        $('#humanize_restore_all').on('click', restoreAllDefaults);

        // Close dropdowns when clicking elsewhere
        $(document).on('click', function() {
            $('.improve-dropdown-menu').hide();
        });

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
