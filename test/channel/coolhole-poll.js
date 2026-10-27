const assert = require('assert');
const CoolholePollModule = require('../../lib/channel/coolhole-poll');

describe('CoolholePollModule', () => {
    describe('#handleVote', () => {
        let pollModule;
        let countedVotes;
        let socketEvents;
        let balances;
        let user;

        beforeEach(() => {
            countedVotes = [];
            socketEvents = [];
            balances = { alice: 100 };

            pollModule = new CoolholePollModule({
                uniqueName: 'testChannel',
                modules: {
                    permissions: { canVote: () => true },
                    coolholepoints: {
                        isUserEligibleForPoints: name => name in balances,
                        get: name => (name in balances ?
                            { user: name, points: balances[name] } : undefined)
                    }
                },
                logger: { log() {} }
            });
            pollModule.broadcastPoll = () => {};

            pollModule.poll = {
                title: 'bet',
                gamble: true,
                gambleStatus: 'open',
                countVote(ip, vote) {
                    countedVotes.push(vote);
                    return true;
                }
            };

            user = {
                realip: '1.2.3.4',
                getName: () => 'alice',
                socket: {
                    emit: (event, data) => socketEvents.push({ event, data })
                }
            };
        });

        it('ignores votes when no poll is open', () => {
            pollModule.poll = null;

            assert.doesNotThrow(() => {
                pollModule.handleVote(user, { option: 0 });
            });
        });

        it('accepts a wager within balance plus the debt allowance', () => {
            pollModule.handleVote(user, { option: 0, wager: 10100 });

            assert.strictEqual(countedVotes.length, 1);
            assert.strictEqual(countedVotes[0].wager, 10100);
        });

        it('rejects a wager larger than balance plus the debt allowance', () => {
            pollModule.handleVote(user, { option: 0, wager: 10101 });

            assert.strictEqual(countedVotes.length, 0);
            assert.strictEqual(socketEvents[0].event, 'validationError');
        });

        it('rejects a huge wager from a user with no points entry', () => {
            user.getName = () => 'mallory';
            pollModule.handleVote(user, { option: 0, wager: 1e12 });

            assert.strictEqual(countedVotes.length, 0);
        });

        it('rejects bets from users who cannot hold coolpoints', () => {
            user.getName = () => '';
            pollModule.handleVote(user, { option: 0, wager: 1 });

            assert.strictEqual(countedVotes.length, 0);
            assert.strictEqual(socketEvents[0].event, 'validationError');
        });

        it('rejects fractional and out-of-range wagers', () => {
            pollModule.handleVote(user, { option: 0, wager: 1.5 });
            pollModule.handleVote(user, { option: 0, wager: 0 });
            pollModule.handleVote(user, { option: 0, wager: 1e308 });

            assert.strictEqual(countedVotes.length, 0);
        });
    });
});
