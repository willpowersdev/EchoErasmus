/**
 * Helpers for turning arbitrary model text into something Alexa can speak.
 *
 * Alexa wraps `.speak()` content in `<speak>` tags, so the payload is parsed as
 * SSML. Unescaped `&`, `<` or `>` produce an invalid response and the device
 * says nothing at all — escaping is a correctness requirement, not a nicety.
 */

/** Alexa rejects responses whose combined speech exceeds 8000 characters. */
const ALEXA_SPEECH_HARD_LIMIT = 6000;
const DEFAULT_MAX_RESPONSE_CHARACTERS = 5000;
const MIN_MAX_RESPONSE_CHARACTERS = 200;

/** The configured response budget, clamped to what Alexa will actually accept. */
export function maxResponseCharacters(): number {
    const raw = process.env["MAX_RESPONSE_CHARACTERS"];
    const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
    const value = Number.isFinite(parsed) ? parsed : DEFAULT_MAX_RESPONSE_CHARACTERS;

    return Math.min(Math.max(value, MIN_MAX_RESPONSE_CHARACTERS), ALEXA_SPEECH_HARD_LIMIT);
}

/**
 * Strip formatting that sounds wrong when read aloud.
 *
 * The system prompt already asks the model to avoid Markdown; this is the
 * belt-and-braces pass for when it slips through anyway.
 */
export function sanitizeForSpeech(text: string): string {
    return text
        // Fenced code blocks: keep the code text, drop the fence and language tag.
        .replace(/```[a-zA-Z0-9+#-]*\n?/g, " ")
        // Markdown links and images: keep the label, drop the target.
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        // Bare URLs read terribly aloud.
        .replace(/\bhttps?:\/\/\S+/gi, "a link")
        // Inline code, bold, italic and strikethrough markers.
        .replace(/[`*_~]/g, "")
        // Heading markers and blockquote markers at the start of a line.
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .replace(/^\s{0,3}>\s?/gm, "")
        // Bullet markers at the start of a line.
        .replace(/^\s{0,3}[-+•]\s+/gm, "")
        // Emoji and other pictographs.
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
        // Control characters that would break the XML payload.
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Trim to `maxChars`, preferring the last sentence boundary so the answer never
 * stops mid-word. Falls back to a word boundary, then to a hard cut.
 */
export function truncateAtSentenceBoundary(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
        return text;
    }

    const window = text.slice(0, maxChars);
    const lastSentenceEnd = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? "),
    );

    // Only honour a sentence boundary that keeps a useful amount of the answer.
    if (lastSentenceEnd > maxChars * 0.5) {
        return window.slice(0, lastSentenceEnd + 1);
    }

    const lastSpace = window.lastIndexOf(" ");
    if (lastSpace > maxChars * 0.5) {
        return `${window.slice(0, lastSpace).trimEnd()}...`;
    }

    return `${window.trimEnd()}...`;
}

/** Escape the five XML entities so the text is valid inside `<speak>`. */
export function escapeForSsml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * Full pipeline: sanitize, bound the length, then escape for SSML.
 *
 * Escaping happens last so the truncation budget is measured against the words
 * the user actually hears rather than against entity markup.
 */
export function prepareSpeech(text: string, maxChars = maxResponseCharacters()): string {
    const sanitized = sanitizeForSpeech(text);
    const bounded = truncateAtSentenceBoundary(sanitized, maxChars);
    return escapeForSsml(bounded);
}
