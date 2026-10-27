const assert = require('assert');
const CoolholePointsActionsOptionsModule = require('../../lib/channel/coolholepoints-actions-options');
const { clampActiveIntervalSeconds } = CoolholePointsActionsOptionsModule;

describe('CoolholePointsActionsOptionsModule', () => {
    describe('#handleSetCpOptions', () => {
        let optsModule;
        let user;

        const optionValue = (actionName, optionName) =>
            optsModule.get(actionName).options
                .find(opt => opt.optionName === optionName).optionValue;

        beforeEach(() => {
            optsModule = new CoolholePointsActionsOptionsModule({
                uniqueName: 'testChannel',
                modules: {
                    permissions: { canSetOptions: () => true }
                },
                users: [],
                broadcastAll() {}
            });
            optsModule.load({
                coolpointsActions: JSON.parse(JSON.stringify(
                    CoolholePointsActionsOptionsModule.cpOptsDefaults
                ))
            });

            user = {
                getName: () => 'mod',
                socket: { emit() {} }
            };
        });

        it('accepts a normal interval sent as a string', () => {
            optsModule.handleSetCpOptions(user, {
                actionName: 'active', optionName: 'interval', optionValue: '60'
            });

            assert.strictEqual(optionValue('active', 'interval'), 60);
        });

        it('rejects intervals that would run the points timer constantly', () => {
            for (const bad of [-1, '0.5', 1, 2147484, 'abc']) {
                optsModule.handleSetCpOptions(user, {
                    actionName: 'active', optionName: 'interval', optionValue: bad
                });
            }

            assert.strictEqual(optionValue('active', 'interval'), 100);
        });

        it('rejects a negative cost for a spending action', () => {
            optsModule.handleSetCpOptions(user, {
                actionName: 'highlight', optionName: 'points', optionValue: '-1000000'
            });

            assert.strictEqual(optionValue('highlight', 'points'), 15);
        });

        it('still allows negative debt-level thresholds', () => {
            optsModule.handleSetCpOptions(user, {
                actionName: 'debtlvl2', optionName: 'points', optionValue: '-200'
            });

            assert.strictEqual(optionValue('debtlvl2', 'points'), -200);
        });

        it('treats the string "false" as false for enabled', () => {
            optsModule.handleSetCpOptions(user, {
                actionName: 'highlight', optionName: 'enabled', optionValue: 'false'
            });

            assert.strictEqual(optionValue('highlight', 'enabled'), false);
        });

        it('ignores a null payload', () => {
            assert.doesNotThrow(() => optsModule.handleSetCpOptions(user, null));
        });
    });

    describe('#load', () => {
        const makeModule = () => {
            const optsModule = new CoolholePointsActionsOptionsModule({
                uniqueName: 'testChannel',
                modules: {
                    permissions: { canSetOptions: () => true }
                },
                users: [],
                broadcastAll() {}
            });
            optsModule.load({});
            return optsModule;
        };

        it('does not share default options between channels', () => {
            const channelA = makeModule();
            const channelB = makeModule();

            channelA.handleSetCpOptions(
                { getName: () => 'owner', socket: { emit() {} } },
                { actionName: 'highlight', optionName: 'enabled', optionValue: false }
            );

            const enabledIn = optsModule => optsModule.get('highlight').options
                .find(opt => opt.optionName === 'enabled').optionValue;
            assert.strictEqual(enabledIn(channelA), false);
            assert.strictEqual(enabledIn(channelB), true);
        });

        it('copies newly added default actions into saved channel data', () => {
            const saved = { coolpointsActions: [] };
            const optsModule = new CoolholePointsActionsOptionsModule({
                uniqueName: 'testChannel',
                modules: {}
            });
            optsModule.load(saved);

            assert.notStrictEqual(
                saved.coolpointsActions[0],
                CoolholePointsActionsOptionsModule.cpOptsDefaults[0]
            );
        });
    });

    describe('#clampActiveIntervalSeconds', () => {
        it('keeps stored values inside the allowed range', () => {
            assert.strictEqual(clampActiveIntervalSeconds(100), 100);
            assert.strictEqual(clampActiveIntervalSeconds(-1), 10);
            assert.strictEqual(clampActiveIntervalSeconds(1e9), 86400);
            assert.strictEqual(clampActiveIntervalSeconds('junk'), 100);
        });
    });
});
