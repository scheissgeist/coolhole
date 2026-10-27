const assert = require('assert');
const Coolpoints = require('../../lib/channel/coolholepoints');

describe('Coolpoints', () => {
    describe('#handleApplyPointsToUser', () => {
        let coolpoints;
        let added;
        let errors;

        beforeEach(() => {
            added = [];
            errors = [];
            coolpoints = new Coolpoints({
                uniqueName: 'testChannel',
                modules: {},
                logger: { log() {} },
                broadcastAll() {}
            });
            coolpoints.logError = err => errors.push(err);
            coolpoints.isUserEligibleForPoints = name => name === 'admin';
            coolpoints.canUpdateOthersPoints = () => true;
            coolpoints.get = name => ({ user: name, points: 0 });
            coolpoints.add = (name, points) => added.push([name, points]);
        });

        const user = name => ({ getName: () => name, socket: { emit() {} } });

        it('does not throw for a guest with no payload', () => {
            assert.doesNotThrow(() => {
                coolpoints.handleApplyPointsToUser(user(''), undefined);
                coolpoints.handleApplyPointsToUser(user(''), {});
            });
            assert.strictEqual(errors.length, 1);
        });

        it('rejects non-integer points', () => {
            for (const points of [Infinity, NaN, '5', 1.5]) {
                coolpoints.handleApplyPointsToUser(user('admin'), {
                    targetName: 'bob', points
                });
            }

            assert.deepStrictEqual(added, []);
        });

        it('applies whole-number points', () => {
            coolpoints.handleApplyPointsToUser(user('admin'), {
                targetName: 'bob', points: 5
            });

            assert.deepStrictEqual(added, [['bob', 5]]);
        });
    });

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
