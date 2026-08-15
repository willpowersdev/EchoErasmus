import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
    escapeForSsml,
    maxResponseCharacters,
    prepareSpeech,
    sanitizeForSpeech,
    truncateAtSentenceBoundary,
} from "../src/utils/AlexaUtils.ts";

afterEach(() => {
    delete process.env["MAX_RESPONSE_CHARACTERS"];
});

describe("sanitizeForSpeech", () => {
    it("strips Markdown emphasis and inline code", () => {
        assert.equal(
            sanitizeForSpeech("Use **bold** and `code` and _italics_"),
            "Use bold and code and italics",
        );
    });

    it("keeps link text and drops the target", () => {
        assert.equal(
            sanitizeForSpeech("See [the docs](https://example.com/docs) for more"),
            "See the docs for more",
        );
    });

    it("replaces bare URLs with something speakable", () => {
        assert.equal(
            sanitizeForSpeech("Read https://example.com/a/b?c=d now"),
            "Read a link now",
        );
    });

    it("removes headings, bullets and code fences", () => {
        const input = "## Steps\n\n- first\n- second\n\n```js\nconst x = 1;\n```";
        assert.equal(sanitizeForSpeech(input), "Steps first second const x = 1;");
    });

    it("removes emoji", () => {
        assert.equal(sanitizeForSpeech("Nice work 🎉 done"), "Nice work done");
    });
});

describe("truncateAtSentenceBoundary", () => {
    it("leaves short text untouched", () => {
        assert.equal(truncateAtSentenceBoundary("Short answer.", 100), "Short answer.");
    });

    it("cuts at the last sentence boundary within the budget", () => {
        const text = "One sentence here. Two sentences here. Three sentences here.";
        const result = truncateAtSentenceBoundary(text, 40);

        assert.equal(result, "One sentence here. Two sentences here.");
        assert.ok(result.length <= 40);
    });

    it("falls back to a word boundary when there is no sentence break", () => {
        const text = "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
        const result = truncateAtSentenceBoundary(text, 30);

        assert.ok(result.length <= 33, `unexpected length ${result.length}`);
        assert.ok(result.endsWith("..."));
        assert.ok(!result.includes("fox"), "should not cut mid-word");
    });
});

describe("escapeForSsml", () => {
    it("escapes the XML entities", () => {
        assert.equal(
            escapeForSsml(`Tom & Jerry <b> "x" 'y'`),
            "Tom &amp; Jerry &lt;b&gt; &quot;x&quot; &apos;y&apos;",
        );
    });
});

describe("maxResponseCharacters", () => {
    it("defaults to 5000", () => {
        assert.equal(maxResponseCharacters(), 5000);
    });

    it("reads the environment variable", () => {
        process.env["MAX_RESPONSE_CHARACTERS"] = "1200";
        assert.equal(maxResponseCharacters(), 1200);
    });

    it("clamps values Alexa would reject", () => {
        process.env["MAX_RESPONSE_CHARACTERS"] = "99999";
        assert.equal(maxResponseCharacters(), 6000);

        process.env["MAX_RESPONSE_CHARACTERS"] = "10";
        assert.equal(maxResponseCharacters(), 200);
    });

    it("ignores an unparseable value", () => {
        process.env["MAX_RESPONSE_CHARACTERS"] = "not-a-number";
        assert.equal(maxResponseCharacters(), 5000);
    });
});

describe("prepareSpeech", () => {
    it("sanitizes, bounds and escapes in one pass", () => {
        const result = prepareSpeech("**Ben & Jerry** make `ice cream`", 100);
        assert.equal(result, "Ben &amp; Jerry make ice cream");
    });

    it("measures the length budget against spoken words, not entities", () => {
        const text = `${"& ".repeat(50)}end`;
        const result = prepareSpeech(text, 60);

        // 30 escaped ampersands would be 150 characters if measured after escaping.
        assert.ok(result.length > 60, "escaping happens after truncation");
        assert.ok(!result.includes("&&"), "every ampersand is escaped");
    });
});
