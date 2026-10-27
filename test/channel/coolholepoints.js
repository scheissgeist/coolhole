const assert = require('assert');
const Coolpoints = require('../../lib/channel/coolholepoints');

describe('Coolpoints', () => {
    describe('#payoutPoll', () => {
        let coolpoints;
        let changes;

        beforeEach(() => {
            changes = [];
            coolpoints = new Coolpoints({
                uniqueName: 'testChannel',
                modules: {},
                logger: { log() {} },
                broadcastAll() {}
            });

            const eligible = new Set(['alice', 'bob']);
            coolpoints.isUserEligibleForPoints = name => eligible.has(name);
            coolpoints.logError = () => {};
            coolpoints.get = name => ({ user: name, points: 0 });
            coolpoints.add = (name, points) => changes.push([name, points]);
            coolpoints.subtract = (name, points) => changes.push([name, -points]);
        });

        it('keeps paying out after a voter who cannot hold points', () => {
            const poll = {
                title: 'bet',
                winningOption: 1,
                votes: new Map([
                    ['ip-guest', { user: '', option: 0, wager: 1 }],
                    ['ip-alice', { user: 'alice', option: 0, wager: 10 }],
                    ['ip-bob', { user: 'bob', option: 1, wager: 10 }]
                ])
            };

            coolpoints.payoutPoll(poll);

            assert.deepStrictEqual(changes, [
                ['alice', -10],
                ['bob', 11]
            ]);
        });
    });
});
