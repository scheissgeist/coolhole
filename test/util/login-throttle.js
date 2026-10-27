const assert = require('assert');
const {
    LoginThrottle,
    isCountedLoginFailure
} = require('../../lib/util/login-throttle');

describe('LoginThrottle', () => {
    let clock;
    let throttle;

    beforeEach(() => {
        clock = 1000;
        throttle = new LoginThrottle({
            maxFailures: 3,
            windowMs: 60000,
            now: () => clock
        });
    });

    it('does not throttle an IP with no failures', () => {
        assert.strictEqual(throttle.isThrottled('1.2.3.4'), false);
    });

    it('throttles an IP after maxFailures failures', () => {
        throttle.recordFailure('1.2.3.4');
        throttle.recordFailure('1.2.3.4');
        assert.strictEqual(throttle.isThrottled('1.2.3.4'), false);

        throttle.recordFailure('1.2.3.4');
        assert.strictEqual(throttle.isThrottled('1.2.3.4'), true);
    });

    it('does not throttle other IPs', () => {
        for (let i = 0; i < 3; i++) {
            throttle.recordFailure('1.2.3.4');
        }

        assert.strictEqual(throttle.isThrottled('5.6.7.8'), false);
    });

    it('stops throttling once the window ends', () => {
        for (let i = 0; i < 3; i++) {
            throttle.recordFailure('1.2.3.4');
        }

        clock += 60000;
        assert.strictEqual(throttle.isThrottled('1.2.3.4'), false);
    });

    it('counts only wrong username or password errors', () => {
        assert.strictEqual(isCountedLoginFailure('Invalid username/password combination'), true);
        assert.strictEqual(isCountedLoginFailure('User does not exist'), true);
        assert.strictEqual(isCountedLoginFailure('Database error'), false);
    });
});
