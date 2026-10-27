const assert = require('assert');
const { CoolholePoll } = require('../lib/coolhole-poll');

describe('CoolholePoll', () => {
    describe('#create', () => {
        it('turns http and https URLs into links', () => {
            const poll = CoolholePoll.create('pollster', 'see https://example.com/x', ['a']);

            assert.strictEqual(
                poll.title,
                'see <a href="https://example.com/x" target="_blank" ' +
                    'rel="noopener noreferer">https://example.com/x</a>'
            );
        });

        it('does not turn javascript: URLs into links', () => {
            const poll = CoolholePoll.create(
                'pollster',
                'title',
                ['javascript://%0aalert%28document.domain%29']
            );

            assert.strictEqual(poll.choices[0], 'javascript://%0aalert%28document.domain%29');
            assert.ok(!poll.choices[0].includes('<a'));
        });

        it('still escapes HTML', () => {
            const poll = CoolholePoll.create('pollster', '<img src=x onerror=alert(1)>', ['a']);

            assert.ok(!poll.title.includes('<img'));
        });
    });
});
