const assert = require('assert');
const Config = require('../../lib/config');
const { isApprovedHost } = require('../../lib/web/account');

describe('web/account', () => {
    describe('#isApprovedHost', () => {
        let oldRoot;
        let oldAlt;

        beforeEach(() => {
            oldRoot = Config.get('http.root-domain');
            oldAlt = Config.get('http.alt-domains');
            Config.set('http.root-domain', 'example.com');
            Config.set('http.alt-domains', ['127.0.0.1']);
        });

        afterEach(() => {
            Config.set('http.root-domain', oldRoot);
            Config.set('http.alt-domains', oldAlt);
        });

        it('accepts the root domain', () => {
            assert.strictEqual(isApprovedHost('example.com'), true);
        });

        it('accepts the root domain with a port', () => {
            assert.strictEqual(isApprovedHost('example.com:8080'), true);
        });

        it('accepts a subdomain of the root domain', () => {
            assert.strictEqual(isApprovedHost('www.example.com'), true);
        });

        it('accepts an alt domain', () => {
            assert.strictEqual(isApprovedHost('127.0.0.1:8080'), true);
        });

        it('rejects an attacker-controlled domain', () => {
            assert.strictEqual(isApprovedHost('evil.test'), false);
        });

        it('rejects a domain that only ends with the root domain text', () => {
            assert.strictEqual(isApprovedHost('notexample.com'), false);
        });

        it('rejects a missing host', () => {
            assert.strictEqual(isApprovedHost(undefined), false);
            assert.strictEqual(isApprovedHost(''), false);
        });
    });
});
