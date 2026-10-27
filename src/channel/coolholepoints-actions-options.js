var ChannelModule = require("./module");
const LOGGER = require("@calzoneman/jsli")("coolpoints-actions");
var Flags = require("../flags");

const ActionType = {
  Earnings: "Earnings",
  Losses: "Losses",
  Expenditures: "Expenditures",
  Statuses: "Statuses",
};

// Bounds for moderator-set coolpoints options (see handleSetCpOptions)
const MIN_ACTIVE_INTERVAL_SECONDS = 10;
const MAX_ACTIVE_INTERVAL_SECONDS = 86400;
const MAX_OPTION_POINTS = 1000000000;
const DEFAULT_ACTIVE_INTERVAL_SECONDS = 100;

/**
 * Keeps a stored "active" interval inside safe bounds, so a bad value saved
 * before validation existed can't run the points timer constantly.
 * @param {*} secs interval in seconds, as stored in channel data
 * @returns {Number} interval in seconds within the allowed range
 */
const clampActiveIntervalSeconds = (secs) => {
  const num = Number(secs);
  if (!Number.isFinite(num)) return DEFAULT_ACTIVE_INTERVAL_SECONDS;
  return Math.min(
    MAX_ACTIVE_INTERVAL_SECONDS,
    Math.max(MIN_ACTIVE_INTERVAL_SECONDS, num)
  );
};

/**
 * Default options for cool points
 * @namespace
 * @property {String} name Name of the option
 * @property {String} actionType Type of action
 * @property {String} modTitle Title for mod options page
 * @property {String} userTitle Title for user status page
 * @property {String} userDescription Description for user status page
 * @property {Array} options Array of option objects
 * @property {String} options.optionName Name of the option
 * @property {String} options.optionType Type of the option
 * @property {*} options.optionValue Value of the option
 * @property {String} options.optionDescription Description of the option
 */
const CP_OPTS_DEFAULTS = [
  {
    name: "active",
    actionType: ActionType["Earnings"],
    modTitle: "Being Active",
    userTitle: "Active",
    userDescription: "Participation is key. A reward to those that are present",
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: 6,
        optionDescription: "Points per Tick",
      },
      {
        optionName: "interval",
        optionType: "time",
        optionValue: 100,
        optionDescription: "Tick Interval",
      },
    ],
  },
  {
    name: "addingVid",
    actionType: ActionType["Earnings"],
    modTitle: "Adding a video",
    userTitle: "Submitting Media",
    userDescription:
      "Providing media is the foundation of the application and is the catalyst for valuable data",
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: 6,
        optionDescription: "Points per Video",
      },
    ],
  },
  {
    name: "skipped",
    actionType: ActionType["Losses"],
    modTitle: "Having your video skipped",
    userTitle: "Unsatisfactory Media",
    userDescription:
      "Not all media is created equal and it's important to ensure you're providing the highest quality content. Please do better in the future. Don't fucking post family guy. Or anime.",
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: 6,
        optionDescription: "Points lost",
      },
    ],
  },
  {
    name: "highlight",
    actionType: ActionType["Expenditures"],
    modTitle: "Highlight",
    userTitle: "Highlight",
    userDescription:
      "Individuality provides a sense of self-expression and personal fulfillment. While modest, this chat message will help you stand out",
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: 15,
        optionDescription: "Cost",
      },
      {
        optionName: "command",
        optionType: "string",
        optionValue: "/highlight",
        optionDescription: "Usage: /highlight",
      },
    ],
  },
  {
    name: "skip",
    actionType: ActionType["Expenditures"],
    modTitle: "Skipping a video",
    userTitle: `"Sister"ing Content`,
    userDescription:
      "As a publicly accountable organization, we are compelled to express our sincerest apprehension regarding the participation of incest.",
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: 20,
        optionDescription: "Cost",
      },
    ],
  },
  {
    name: "danmu",
    actionType: ActionType["Expenditures"],
    modTitle: "Danmaku ('On Screen' Comments)",
    userTitle: "Danmu",
    userDescription: `AKA: Danmaku or barrage or niconico video is usually described as は、ニコニコ動画で流れる文字コメントのことで、動画をより楽しい \ (•◡•) /コメントが彩ります`,
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: 250,
        optionDescription: "Cost",
      },
      {
        optionName: "command",
        optionType: "string",
        optionValue: "/danmu",
        optionDescription: "Usage: /danmu",
      },
    ],
  },
  {
    name: "secretary",
    actionType: ActionType["Expenditures"],
    modTitle: "Super Invasive Chat",
    userTitle: "Invasive Chat Message",
    userDescription:
      "Children who are often deprived of attention resort to frequent disruptions through auditory and visual harassment. To be noticed, to be seen, is to be reminded that you're alive; that you matter. Use her wisely.",
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: 10000,
        optionDescription: "Cost",
      },
      {
        optionName: "command",
        optionType: "string",
        optionValue: "/secretary",
        optionDescription: "Usage: /secretary",
      },
    ],
  },
  {
    name: "debtlvl0",
    actionType: ActionType["Statuses"],
    modTitle: "Debt Level 0 - Stutter filter",
    userTitle: "Debt Level 0 - Repeating Interruptions of Typical Speech",
    userDescription:
      "Our bio-integrated cryptocurrency may cause speech repetition due to additional Proof of Work requirements for users below a certain threshold.",
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: 5,
        optionDescription: "Points below",
      },
    ],
  },
  {
    name: "debtlvl1",
    actionType: ActionType["Statuses"],
    modTitle: "Debt Level 1 - Lisp filter",
    userTitle: "Debt Level 1 - Further Degradation of Speech",
    userDescription:
      "It's unsure if this effect is the result of impaired faculties or if it's a best estimation of what the fiscally irresponsible sound like.",
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: -10,
        optionDescription: "Points below",
      },
    ],
  },
  {
    name: "debtlvl2",
    actionType: ActionType["Statuses"],
    modTitle: "Debt Level 2 - Random Ad",
    userTitle: "Debt Level 2 - Occasional Content Insertion to Recoup Cost",
    userDescription:
      "To avoid the ability to provide you with more opportunities to contribute, we require external sources to keep operating costs nominal.",
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: -100,
        optionDescription: "Points below",
      },
    ],
  },
  {
    name: "debtlvl3",
    actionType: ActionType["Statuses"],
    modTitle: "Debt Level 3 - 'Coolhole1' Text",
    userTitle: "Debt Level 3 - Lower Physical Footprint",
    userDescription:
      "As your brain and body begin to degrade, it becomes necessary to reduce swelling by reducing the text size reducing necessary throughput to continue minimal cognitive development.",
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: -500,
        optionDescription: "Points below",
      },
    ],
  },
  {
    name: "debtlvl4",
    actionType: ActionType["Statuses"],
    modTitle: "Debt Level 4 - Letters Missing",
    userTitle: "Debt Level 4 - Reduced Bandwidth",
    userDescription:
      "It's at this point that your brainwaves have become unstable and we cannot guarantee total transmission of your messages.",
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: -1000,
        optionDescription: "Points below",
      },
    ],
  },
  {
    name: "debtlvl5",
    actionType: ActionType["Statuses"],
    modTitle: "Debt Level 5 - 'Criticality Animation'",
    userTitle: "Debt Level 5 - Criticality Event",
    userDescription:
      "Criticality accident likely. May God have mercy on your soul.",
    options: [
      {
        optionName: "enabled",
        optionType: "bool",
        optionValue: true,
        optionDescription: "Enable",
      },
      {
        optionName: "points",
        optionType: "int",
        optionValue: -2000,
        optionDescription: "Points below",
      },
    ],
  },
];

const cpOptTypes = Object.keys(ActionType);

/**
 * Coolpoints options control how users earn, lose, spend and are effected by coolpoints
 * @param {Object} _channel
 */
class CoolholePointsActionsOptionsModule extends ChannelModule {
  constructor(_channel) {
    super(_channel);

    ChannelModule.apply(this, arguments);

    this.supportsDirtyCheck = true;
    this.actionTypes = ActionType;
    this.coolpointsActions = [];

    /**
     * cpActions defines the list of actions available
     * @type {Array.<Object>}
     */
    this.actionsDefault = CP_OPTS_DEFAULTS;
  }

  /**
   * Post join hook
   * @param {*} user user object
   */
  onUserPostJoin(user) {
    if (!user.channel.is(Flags.C_REGISTERED)) return;

    user.socket.on("setCpOptions", this.handleSetCpOptions.bind(this, user));
    user.socket.on("getCpOptions", this.sendCpOpts.bind(this, [user]));

    this.sendCpOpts([user]);
  }

  /**
   * Generic Log Error wrapper
   * @param {Object} errorObject Error information
   * @param {Object} errorObject.user User information
   * @param {String} errorObject.callingFunction Function the error was caught in
   * @param {String} errorObject.returnSocket Event name to emit to
   * @param {String} errorObject.err Error string
   * @param {Object} errorObject.data Data related to the error
   * @param {String} errorObject.userMessage Message to display to the user
   */
  logError({ user, callingFunction, returnSocket, err, data, userMessage }) {
    LOGGER.error(`Exception caught in ${callingFunction}. Error:  ${err}`);

    LOGGER.error(
      `Unkown error in ${callingFunction} for CoolholePointsActionsOptionsModule. Here's hopefully relevant data: ${JSON.stringify(
        data ? data : {}
      )}`
    );

    if (returnSocket)
      // Return an empty array of point data... for now probably
      user.socket.emit(returnSocket, new ReturnMsg("error", userMessage, []));
  }

  /**
   * Load CoolholePointsActions
   * @param {Object} data CoolholePointsActions class
   */
  load(data) {
    if ("coolpointsActions" in data) {
      // Compare actionDefaults and data.coolpointsActions and push any new default actions to data.coolpointsActions
      const defaultActions = this.actionsDefault;
      const newActions = defaultActions.filter((defaultAction) => {
        return !data.coolpointsActions.some(
          (action) => action.name === defaultAction.name
        );
      });
      data.coolpointsActions.push(...newActions);

      this.coolpointsActions = data.coolpointsActions;
      this.dirty = false;
    } else {
      //otherwise, just start with defaults
      this.coolpointsActions = this.actionsDefault;

      //set dirty flag so bgtask will save it
      this.dirty = true;
    }
  }

  /**
   * Saves coolpointsActions to channel data
   * @param {*} data
   */
  save(data) {
    data.coolpointsActions = this.coolpointsActions;
  }

  /**
   * Load action name from channel data
   * @param {String} name Action name
   * @returns
   */
  get(name) {
    if (this.coolpointsActions.length === 0) {
      LOGGER.error(
        "No coolpointsActions found for this channel.. Forcing load?"
      );
      this.load({});
    }
    if (!this.coolpointsActions.some((action) => action.name === name)) {
      LOGGER.error(`CP Action Not found: ${name}`);
      throw new Error(`CP Action Not found: ${name}`);
    }

    return this.coolpointsActions.find((action) => action.name === name);
  }

  /**
   * Set Action Options based on name
   * @param {String} actionName
   * @param {String} optionName
   * @param {*} optionValue
   */
  set(actionName, optionName, optionValue) {
    try {
      const action = this.get(actionName);
      if (action.options.some((option) => option.optionName === optionName))
        action.options.find(
          (option) => option.optionName === optionName
        ).optionValue = optionValue;
      else
        LOGGER.error(
          `Unable to find option ${optionName} for action ${actionName} for CoolholePointsActionsOptionsModule.`
        );
    } catch (e) {
      LOGGER.error(
        `Something went wrong setting option ${optionName} for action ${actionName} for CoolholePointsActionsOptionsModule.`
      );
      LOGGER.error(e);
    }
  }

  /**
   * Send options to each provided user
   * @param {Array.*} users Array of user objects
   */
  sendCpOpts(users) {
    const actions = this.coolpointsActions;

    if (users === this.channel.users) {
      this.channel.broadcastAll("channelCoolPointOpts", actions);
    } else {
      users.forEach(function (user) {
        user.socket.emit("channelCoolPointOpts", actions);
      });
    }
  }

  /**
   * Gets permissions. Copied from opts... Seems kinda silly
   * @returns permissions class
   */
  getPermissions() {
    return this.channel.modules.permissions;
  }

  /**
   * Validate and update options based on data provided
   * @param {*} user Users object
   * @param {Object} data Data object
   * @param {String} data.actionName Name of the action we want updated
   * @param {String} data.optionName Name of the option within the action we want updated
   * @param {*} data.optionValue value of the option within the action we want updated
   */
  handleSetCpOptions(user, data) {
    if (!data || typeof data !== "object") {
      return;
    }

    if (!this.getPermissions().canSetOptions(user)) {
      user.kick("Attempted setCpOptions as a non-moderator");
      this.logError({
        user,
        callingFunction: "handleSetCpOptions",
        returnSocket: "coolpointsFailure",
        err: `User ${user.getName()} is not a moderator`,
        data,
        userMessage: "You are not a moderator",
      });
      return;
    }

    let sendUpdate = false;

    // Parses a whole number sent as a number or numeric string; null if not.
    const parseWholeNumber = (val) => {
      if (typeof val !== "number" && typeof val !== "string") return null;
      if (!/^\s*-?\d+\s*$/.test(String(val))) return null;
      const num = Number(val);
      return Number.isSafeInteger(num) ? num : null;
    };
    const isValidPoints = (actionName, pts) => {
      const num = parseWholeNumber(pts);
      if (num === null || num === 0 || Math.abs(num) > MAX_OPTION_POINTS) {
        return false;
      }
      // Only debt-level thresholds (Statuses) may be negative.  A negative
      // cost or reward would let a moderator mint or drain points.
      const action = this.coolpointsActions.find((a) => a.name === actionName);
      return num > 0 || action?.actionType === ActionType.Statuses;
    };
    // Interval is in seconds.  Too small a value (or one past Node's timer
    // limit, which Node treats as 1 ms) runs the points timer constantly for
    // every user in the channel and can stall the whole server.
    const isValidInterval = (secs) => {
      const num = parseWholeNumber(secs);
      return num !== null &&
        num >= MIN_ACTIVE_INTERVAL_SECONDS &&
        num <= MAX_ACTIVE_INTERVAL_SECONDS;
    };
    const targetBuilder = (action, option) => `#cp-${action}-${option}`;
    const isValidInput = (actionName, optionName, optionValue) => {
      switch (optionName) {
        case "points":
        case "interval":
          if (optionName === "points" && !isValidPoints(actionName, optionValue)) {
            user.socket.emit("validationError", {
              target: targetBuilder(actionName, optionName),
              message: `Input must be a whole number (non-zero, at most ${MAX_OPTION_POINTS}; only debt levels may be negative), not "${optionValue}"`,
            });
            return false;
          }

          if (optionName === "interval" && !isValidInterval(optionValue)) {
            user.socket.emit("validationError", {
              target: targetBuilder(actionName, optionName),
              message: `Interval must be a whole number of seconds between ${MIN_ACTIVE_INTERVAL_SECONDS} and ${MAX_ACTIVE_INTERVAL_SECONDS}, not "${optionValue}"`,
            });
            return false;
          }

          user.socket.emit("validationPassed", {
            target: targetBuilder(actionName, optionName),
          });
          return true;

        case "enabled":
          // TODO: Validate more? Seems unnecessary to begin with but w/e
          if (
            typeof optionValue !== "boolean" &&
            !/^(true|false)$/i.test(optionValue)
          ) {
            user.socket.emit("validationError", {
              target: targetBuilder(actionName, optionName),
              message: `Provided value doesn't seem like a booelan: "${optionValue}"`,
            });
            return false;
          }

          return true;

        default:
          // If we don't know it, how can we validate?
          return false;
      }
    };
    // Trying to prevent bad data from being in here...
    const normalizeInput = (optionType, val) => {
      switch (optionType) {
        case "points":
        case "interval":
          return parseInt(val) || 0;

        case "enabled":
          // "false" (a string) must mean false, not true
          return val === true || /^true$/i.test(val);

        default:
          // If we don't know it, how can we normalize?
          return null;
      }
    };

    if (isValidInput(data.actionName, data.optionName, data.optionValue)) {
      this.set(
        data.actionName,
        data.optionName,
        normalizeInput(data.optionName, data.optionValue)
      );
      sendUpdate = true;
    }

    if (sendUpdate) {
      LOGGER.info(
        "[mod] " + user.getName() + " updated coolpoint channel options"
      );
      this.dirty = true;
      this.sendCpOpts(this.channel.users);
    }
  }
}

module.exports = CoolholePointsActionsOptionsModule;
module.exports.cpOptsDefaults = CP_OPTS_DEFAULTS;
module.exports.cpOptTypes = cpOptTypes;
module.exports.ActionType = ActionType;
module.exports.clampActiveIntervalSeconds = clampActiveIntervalSeconds;
