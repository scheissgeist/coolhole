/**
 * Limits failed password attempts per IP address, to slow down online
 * password guessing against /login and the socket.io "login" event.
 *
 * Only failures are counted.  Once an IP reaches `maxFailures` within
 * `windowMs`, further attempts from it are refused until the window ends.
 */
class LoginThrottle {
    /**
     * @param {object} [options]
     * @param {number} [options.maxFailures=20] failures allowed per window
     * @param {number} [options.windowMs=900000] window length (default 15 min)
     * @param {function(): number} [options.now=Date.now] clock, for tests
     */
    constructor({ maxFailures = 20, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
        this.maxFailures = maxFailures;
        this.windowMs = windowMs;
        this.now = now;
        this.failures = new Map();
    }

    /**
     * @param {string} ip client IP address
     * @returns {boolean} true if this IP must not attempt another login yet
     */
    isThrottled(ip) {
        const entry = this._getEntry(ip);
        return entry !== null && entry.count >= this.maxFailures;
    }

    /**
     * Records a failed login attempt from an IP.
     *
     * @param {string} ip client IP address
     */
    recordFailure(ip) {
        this._sweep();

        let entry = this._getEntry(ip);
        if (entry === null) {
            entry = { count: 0, resetAt: this.now() + this.windowMs };
            this.failures.set(ip, entry);
        }

        entry.count++;
    }

    _getEntry(ip) {
        const entry = this.failures.get(ip);
        if (!entry) {
            return null;
        }

        if (this.now() >= entry.resetAt) {
            this.failures.delete(ip);
            return null;
        }

        return entry;
    }

    // Drop expired entries so the map can't grow without bound.
    _sweep() {
        if (this.failures.size < 1000) {
            return;
        }

        const now = this.now();
        for (const [ip, entry] of this.failures) {
            if (now >= entry.resetAt) {
                this.failures.delete(ip);
            }
        }
    }
}

const LOGIN_THROTTLE_MESSAGE = "Too many failed login attempts.  Please try again later.";

// Login failures that count toward the limit.
const COUNTED_LOGIN_ERRORS = new Set([
    "Invalid username/password combination",
    "User does not exist"
]);

/**
 * @param {*} err error returned by db.users.verifyLogin
 * @returns {boolean} true if the error is a wrong username or password
 */
function isCountedLoginFailure(err) {
    return COUNTED_LOGIN_ERRORS.has(err);
}

// Shared by the HTTP and socket.io login paths.
const loginThrottle = new LoginThrottle();

export { LoginThrottle, loginThrottle, isCountedLoginFailure, LOGIN_THROTTLE_MESSAGE };
