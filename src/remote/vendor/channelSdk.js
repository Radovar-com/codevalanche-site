var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod3) => function __require() {
  try {
    return mod3 || (0, cb[__getOwnPropNames(cb)[0]])((mod3 = { exports: {} }).exports, mod3), mod3.exports;
  } catch (e) {
    throw mod3 = 0, e;
  }
};

// ../users-remote-service-20261011/node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "../users-remote-service-20261011/node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// ../users-remote-service-20261011/node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "../users-remote-service-20261011/node_modules/fast-deep-equal/index.js"(exports, module) {
    "use strict";
    module.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// ../users-remote-service-20261011/node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "../users-remote-service-20261011/node_modules/ajv/dist/runtime/equal.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports.default = equal;
  }
});

// ../users-remote-service-20261011/node_modules/ajv-formats/dist/formats.js
var require_formats = __commonJS({
  "../users-remote-service-20261011/node_modules/ajv-formats/dist/formats.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.formatNames = exports.fastFormats = exports.fullFormats = void 0;
    function fmtDef(validate, compare) {
      return { validate, compare };
    }
    exports.fullFormats = {
      // date: http://tools.ietf.org/html/rfc3339#section-5.6
      date: fmtDef(date, compareDate),
      // date-time: http://tools.ietf.org/html/rfc3339#section-5.6
      time: fmtDef(getTime(true), compareTime),
      "date-time": fmtDef(getDateTime(true), compareDateTime),
      "iso-time": fmtDef(getTime(), compareIsoTime),
      "iso-date-time": fmtDef(getDateTime(), compareIsoDateTime),
      // duration: https://tools.ietf.org/html/rfc3339#appendix-A
      duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
      uri,
      "uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
      // uri-template: https://tools.ietf.org/html/rfc6570
      "uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
      // For the source: https://gist.github.com/dperini/729294
      // For test cases: https://mathiasbynens.be/demo/url-regex
      url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
      email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
      hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
      // optimized https://www.safaribooksonline.com/library/view/regular-expressions-cookbook/9780596802837/ch07s16.html
      ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
      ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
      regex,
      // uuid: http://tools.ietf.org/html/rfc4122
      uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
      // JSON-pointer: https://tools.ietf.org/html/rfc6901
      // uri fragment: https://tools.ietf.org/html/rfc3986#appendix-A
      "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
      "json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
      // relative JSON-pointer: http://tools.ietf.org/html/draft-luff-relative-json-pointer-00
      "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
      // the following formats are used by the openapi specification: https://spec.openapis.org/oas/v3.0.0#data-types
      // byte: https://github.com/miguelmota/is-base64
      byte,
      // signed 32 bit integer
      int32: { type: "number", validate: validateInt32 },
      // signed 64 bit integer
      int64: { type: "number", validate: validateInt64 },
      // C-type float
      float: { type: "number", validate: validateNumber },
      // C-type double
      double: { type: "number", validate: validateNumber },
      // hint to the UI to hide input strings
      password: true,
      // unchecked string payload
      binary: true
    };
    exports.fastFormats = {
      ...exports.fullFormats,
      date: fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, compareDate),
      time: fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareTime),
      "date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareDateTime),
      "iso-time": fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoTime),
      "iso-date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoDateTime),
      // uri: https://github.com/mafintosh/is-my-json-valid/blob/master/formats.js
      uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
      "uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
      // email (sources from jsen validator):
      // http://stackoverflow.com/questions/201323/using-a-regular-expression-to-validate-an-email-address#answer-8829363
      // http://www.w3.org/TR/html5/forms.html#valid-e-mail-address (search for 'wilful violation')
      email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
    };
    exports.formatNames = Object.keys(exports.fullFormats);
    function isLeapYear(year) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }
    var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
    var DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    function date(str) {
      const matches = DATE.exec(str);
      if (!matches)
        return false;
      const year = +matches[1];
      const month = +matches[2];
      const day = +matches[3];
      return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
    }
    function compareDate(d1, d2) {
      if (!(d1 && d2))
        return void 0;
      if (d1 > d2)
        return 1;
      if (d1 < d2)
        return -1;
      return 0;
    }
    var TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
    function getTime(strictTimeZone) {
      return function time(str) {
        const matches = TIME.exec(str);
        if (!matches)
          return false;
        const hr = +matches[1];
        const min = +matches[2];
        const sec = +matches[3];
        const tz = matches[4];
        const tzSign = matches[5] === "-" ? -1 : 1;
        const tzH = +(matches[6] || 0);
        const tzM = +(matches[7] || 0);
        if (tzH > 23 || tzM > 59 || strictTimeZone && !tz)
          return false;
        if (hr <= 23 && min <= 59 && sec < 60)
          return true;
        const utcMin = min - tzM * tzSign;
        const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
        return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
      };
    }
    function compareTime(s1, s2) {
      if (!(s1 && s2))
        return void 0;
      const t1 = (/* @__PURE__ */ new Date("2020-01-01T" + s1)).valueOf();
      const t2 = (/* @__PURE__ */ new Date("2020-01-01T" + s2)).valueOf();
      if (!(t1 && t2))
        return void 0;
      return t1 - t2;
    }
    function compareIsoTime(t1, t2) {
      if (!(t1 && t2))
        return void 0;
      const a1 = TIME.exec(t1);
      const a2 = TIME.exec(t2);
      if (!(a1 && a2))
        return void 0;
      t1 = a1[1] + a1[2] + a1[3];
      t2 = a2[1] + a2[2] + a2[3];
      if (t1 > t2)
        return 1;
      if (t1 < t2)
        return -1;
      return 0;
    }
    var DATE_TIME_SEPARATOR = /t|\s/i;
    function getDateTime(strictTimeZone) {
      const time = getTime(strictTimeZone);
      return function date_time(str) {
        const dateTime = str.split(DATE_TIME_SEPARATOR);
        return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1]);
      };
    }
    function compareDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const d1 = new Date(dt1).valueOf();
      const d2 = new Date(dt2).valueOf();
      if (!(d1 && d2))
        return void 0;
      return d1 - d2;
    }
    function compareIsoDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const [d1, t1] = dt1.split(DATE_TIME_SEPARATOR);
      const [d2, t2] = dt2.split(DATE_TIME_SEPARATOR);
      const res = compareDate(d1, d2);
      if (res === void 0)
        return void 0;
      return res || compareTime(t1, t2);
    }
    var NOT_URI_FRAGMENT = /\/|:/;
    var URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
    function uri(str) {
      return NOT_URI_FRAGMENT.test(str) && URI.test(str);
    }
    var BYTE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
    function byte(str) {
      BYTE.lastIndex = 0;
      return BYTE.test(str);
    }
    var MIN_INT32 = -(2 ** 31);
    var MAX_INT32 = 2 ** 31 - 1;
    function validateInt32(value) {
      return Number.isInteger(value) && value <= MAX_INT32 && value >= MIN_INT32;
    }
    function validateInt64(value) {
      return Number.isInteger(value);
    }
    function validateNumber() {
      return true;
    }
    var Z_ANCHOR = /[^\\]\\Z/;
    function regex(str) {
      if (Z_ANCHOR.test(str))
        return false;
      try {
        new RegExp(str);
        return true;
      } catch (e) {
        return false;
      }
    }
  }
});

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/errors.js
var HpkeError = class extends Error {
  constructor(e) {
    let message;
    if (e instanceof Error) {
      message = e.message;
    } else if (typeof e === "string") {
      message = e;
    } else {
      message = "";
    }
    super(message);
    this.name = this.constructor.name;
  }
};
var InvalidParamError = class extends HpkeError {
};
var SerializeError = class extends HpkeError {
};
var DeserializeError = class extends HpkeError {
};
var EncapError = class extends HpkeError {
};
var DecapError = class extends HpkeError {
};
var ExportError = class extends HpkeError {
};
var SealError = class extends HpkeError {
};
var OpenError = class extends HpkeError {
};
var MessageLimitReachedError = class extends HpkeError {
};
var DeriveKeyPairError = class extends HpkeError {
};
var NotSupportedError = class extends HpkeError {
};

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/_dnt.shims.js
var dntGlobals = {};
var dntGlobalThis = createMergeProxy(globalThis, dntGlobals);
function createMergeProxy(baseObj, extObj) {
  return new Proxy(baseObj, {
    get(_target, prop, _receiver) {
      if (prop in extObj) {
        return extObj[prop];
      } else {
        return baseObj[prop];
      }
    },
    set(_target, prop, value) {
      if (prop in extObj) {
        delete extObj[prop];
      }
      baseObj[prop] = value;
      return true;
    },
    deleteProperty(_target, prop) {
      let success = false;
      if (prop in extObj) {
        delete extObj[prop];
        success = true;
      }
      if (prop in baseObj) {
        delete baseObj[prop];
        success = true;
      }
      return success;
    },
    ownKeys(_target) {
      const baseKeys = Reflect.ownKeys(baseObj);
      const extKeys = Reflect.ownKeys(extObj);
      const extKeysSet = new Set(extKeys);
      return [...baseKeys.filter((k) => !extKeysSet.has(k)), ...extKeys];
    },
    defineProperty(_target, prop, desc) {
      if (prop in extObj) {
        delete extObj[prop];
      }
      Reflect.defineProperty(baseObj, prop, desc);
      return true;
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (prop in extObj) {
        return Reflect.getOwnPropertyDescriptor(extObj, prop);
      } else {
        return Reflect.getOwnPropertyDescriptor(baseObj, prop);
      }
    },
    has(_target, prop) {
      return prop in extObj || prop in baseObj;
    }
  });
}

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/algorithm.js
async function loadSubtleCrypto() {
  if (dntGlobalThis !== void 0 && globalThis.crypto !== void 0) {
    return globalThis.crypto.subtle;
  }
  try {
    const { webcrypto } = await import("crypto");
    return webcrypto.subtle;
  } catch (e) {
    throw new NotSupportedError(e);
  }
}
var NativeAlgorithm = class {
  constructor() {
    Object.defineProperty(this, "_api", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
  }
  async _setup() {
    if (this._api !== void 0) {
      return;
    }
    this._api = await loadSubtleCrypto();
  }
};

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/identifiers.js
var Mode = {
  Base: 0,
  Psk: 1,
  Auth: 2,
  AuthPsk: 3
};
var KemId = {
  NotAssigned: 0,
  DhkemP256HkdfSha256: 16,
  DhkemP384HkdfSha384: 17,
  DhkemP521HkdfSha512: 18,
  DhkemSecp256k1HkdfSha256: 19,
  DhkemX25519HkdfSha256: 32,
  DhkemX448HkdfSha512: 33,
  HybridkemX25519Kyber768: 48,
  MlKem512: 64,
  MlKem768: 65,
  MlKem1024: 66,
  XWing: 25722
};
var KdfId = {
  HkdfSha256: 1,
  HkdfSha384: 2,
  HkdfSha512: 3,
  Sha3256: 4,
  Sha3384: 5,
  Sha3512: 6,
  Shake128: 16,
  Shake256: 17,
  TurboShake128: 18,
  TurboShake256: 19
};
var AeadId = {
  Aes128Gcm: 1,
  Aes256Gcm: 2,
  Chacha20Poly1305: 3,
  ExportOnly: 65535
};

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/consts.js
var INPUT_LENGTH_LIMIT = 8192;
var INFO_LENGTH_LIMIT = 268435456;
var MINIMUM_PSK_LENGTH = 32;
var EMPTY = /* @__PURE__ */ new Uint8Array(0);
var BYTE_TO_BIGINT_256 = /* @__PURE__ */ (() => {
  const out = new Array(256);
  let i = 0;
  let value = 0n;
  while (i < 256) {
    out[i] = value;
    i++;
    value += 1n;
  }
  return out;
})();

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/interfaces/kemInterface.js
var SUITE_ID_HEADER_KEM = /* @__PURE__ */ new Uint8Array([
  75,
  69,
  77,
  0,
  0
]);

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/kdfs/hkdf.js
var HPKE_VERSION = /* @__PURE__ */ new Uint8Array([
  72,
  80,
  75,
  69,
  45,
  118,
  49
]);
function toUint8Array(input) {
  return new Uint8Array(toArrayBuffer(input));
}
function toArrayBuffer(input) {
  if (input instanceof ArrayBuffer) {
    return input;
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice().buffer;
  }
  return new Uint8Array(input).slice().buffer;
}
var HkdfNative = class extends NativeAlgorithm {
  constructor() {
    super();
    Object.defineProperty(this, "id", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: KdfId.HkdfSha256
    });
    Object.defineProperty(this, "hashSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "_suiteId", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: EMPTY
    });
    Object.defineProperty(this, "algHash", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: {
        name: "HMAC",
        hash: "SHA-256",
        length: 256
      }
    });
  }
  init(suiteId) {
    this._suiteId = suiteId;
  }
  buildLabeledIkm(label, ikm) {
    this._checkInit();
    const ret = new Uint8Array(7 + this._suiteId.byteLength + label.byteLength + ikm.byteLength);
    ret.set(HPKE_VERSION, 0);
    ret.set(this._suiteId, 7);
    ret.set(label, 7 + this._suiteId.byteLength);
    ret.set(ikm, 7 + this._suiteId.byteLength + label.byteLength);
    return ret;
  }
  buildLabeledInfo(label, info, len) {
    this._checkInit();
    const ret = new Uint8Array(9 + this._suiteId.byteLength + label.byteLength + info.byteLength);
    ret.set(new Uint8Array([0, len]), 0);
    ret.set(HPKE_VERSION, 2);
    ret.set(this._suiteId, 9);
    ret.set(label, 9 + this._suiteId.byteLength);
    ret.set(info, 9 + this._suiteId.byteLength + label.byteLength);
    return ret;
  }
  async extract(salt, ikm) {
    await this._setup();
    const saltBuf = salt.byteLength === 0 ? new ArrayBuffer(this.hashSize) : toArrayBuffer(salt);
    if (saltBuf.byteLength !== this.hashSize) {
      throw new InvalidParamError("The salt length must be the same as the hashSize");
    }
    const ikmBuf = toArrayBuffer(ikm);
    const key = await this._api.importKey("raw", saltBuf, this.algHash, false, [
      "sign"
    ]);
    return await this._api.sign("HMAC", key, ikmBuf);
  }
  async expand(prk, info, len) {
    await this._setup();
    const prkBuf = toArrayBuffer(prk);
    const key = await this._api.importKey("raw", prkBuf, this.algHash, false, [
      "sign"
    ]);
    const okm = new ArrayBuffer(len);
    const okmBytes = new Uint8Array(okm);
    let prev = EMPTY;
    const mid = toUint8Array(info);
    const tail = new Uint8Array(1);
    if (len > 255 * this.hashSize) {
      throw new Error("Entropy limit reached");
    }
    const tmp = new Uint8Array(this.hashSize + mid.length + 1);
    for (let i = 1, cur = 0; cur < okmBytes.length; i++) {
      tail[0] = i;
      tmp.set(prev, 0);
      tmp.set(mid, prev.length);
      tmp.set(tail, prev.length + mid.length);
      prev = new Uint8Array(await this._api.sign("HMAC", key, tmp.slice(0, prev.length + mid.length + 1)));
      if (okmBytes.length - cur >= prev.length) {
        okmBytes.set(prev, cur);
        cur += prev.length;
      } else {
        okmBytes.set(prev.slice(0, okmBytes.length - cur), cur);
        cur += okmBytes.length - cur;
      }
    }
    return okm;
  }
  async extractAndExpand(salt, ikm, info, len) {
    await this._setup();
    const ikmBuf = toArrayBuffer(ikm);
    const baseKey = await this._api.importKey("raw", ikmBuf, "HKDF", false, ["deriveBits"]);
    return await this._api.deriveBits({
      name: "HKDF",
      hash: this.algHash.hash,
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(info)
    }, baseKey, len * 8);
  }
  async labeledExtract(salt, label, ikm) {
    return await this.extract(salt, this.buildLabeledIkm(label, ikm));
  }
  async labeledExpand(prk, label, info, len) {
    return await this.expand(prk, this.buildLabeledInfo(label, info, len), len);
  }
  _checkInit() {
    if (this._suiteId === EMPTY) {
      throw new Error("Not initialized. Call init()");
    }
  }
};
var HkdfSha256Native = class extends HkdfNative {
  constructor() {
    super(...arguments);
    Object.defineProperty(this, "id", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: KdfId.HkdfSha256
    });
    Object.defineProperty(this, "hashSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 32
    });
    Object.defineProperty(this, "algHash", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: {
        name: "HMAC",
        hash: "SHA-256",
        length: 256
      }
    });
  }
};

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/utils/misc.js
var isCryptoKeyPair = (x) => typeof x === "object" && x !== null && typeof x.privateKey === "object" && typeof x.publicKey === "object";
function i2Osp(n, w) {
  if (w <= 0) {
    throw new Error("i2Osp: too small size");
  }
  if (n >= 256 ** w) {
    throw new Error("i2Osp: too large integer");
  }
  const ret = new Uint8Array(w);
  for (let i = 0; i < w && n; i++) {
    ret[w - (i + 1)] = n % 256;
    n = Math.floor(n / 256);
  }
  return ret;
}
function concat(a, b) {
  const ret = new Uint8Array(a.length + b.length);
  ret.set(a, 0);
  ret.set(b, a.length);
  return ret;
}
function base64UrlToBytes(v) {
  const base64 = v.replace(/-/g, "+").replace(/_/g, "/");
  const byteString = atob(base64);
  const ret = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    ret[i] = byteString.charCodeAt(i);
  }
  return ret;
}
function xor(a, b) {
  if (a.byteLength !== b.byteLength) {
    throw new Error("xor: different length inputs");
  }
  const buf = new Uint8Array(a.byteLength);
  for (let i = 0; i < a.byteLength; i++) {
    buf[i] = a[i] ^ b[i];
  }
  return buf;
}

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/kems/dhkem.js
var LABEL_EAE_PRK = /* @__PURE__ */ new Uint8Array([
  101,
  97,
  101,
  95,
  112,
  114,
  107
]);
var LABEL_SHARED_SECRET = /* @__PURE__ */ new Uint8Array([
  115,
  104,
  97,
  114,
  101,
  100,
  95,
  115,
  101,
  99,
  114,
  101,
  116
]);
function concat3(a, b, c) {
  const ret = new Uint8Array(a.length + b.length + c.length);
  ret.set(a, 0);
  ret.set(b, a.length);
  ret.set(c, a.length + b.length);
  return ret;
}
var Dhkem = class {
  constructor(id, prim, kdf) {
    Object.defineProperty(this, "id", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "secretSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "encSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "publicKeySize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "privateKeySize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "_prim", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_kdf", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.id = id;
    this._prim = prim;
    this._kdf = kdf;
    const suiteId = new Uint8Array(SUITE_ID_HEADER_KEM);
    suiteId.set(i2Osp(this.id, 2), 3);
    this._kdf.init(suiteId);
  }
  async serializePublicKey(key) {
    return await this._prim.serializePublicKey(key);
  }
  async deserializePublicKey(key) {
    return await this._prim.deserializePublicKey(toArrayBuffer(key));
  }
  async serializePrivateKey(key) {
    return await this._prim.serializePrivateKey(key);
  }
  async deserializePrivateKey(key) {
    return await this._prim.deserializePrivateKey(toArrayBuffer(key));
  }
  async importKey(format, key, isPublic = true) {
    return await this._prim.importKey(format, key, isPublic);
  }
  async generateKeyPair() {
    return await this._prim.generateKeyPair();
  }
  async deriveKeyPair(ikm) {
    const rawIkm = toArrayBuffer(ikm);
    if (rawIkm.byteLength > INPUT_LENGTH_LIMIT) {
      throw new InvalidParamError("Too long ikm");
    }
    return await this._prim.deriveKeyPair(rawIkm);
  }
  async encap(params) {
    let ke;
    if (params.ekm === void 0) {
      ke = await this.generateKeyPair();
    } else if (isCryptoKeyPair(params.ekm)) {
      ke = params.ekm;
    } else {
      ke = await this.deriveKeyPair(params.ekm);
    }
    const enc = await this._prim.serializePublicKey(ke.publicKey);
    const pkrm = await this._prim.serializePublicKey(params.recipientPublicKey);
    try {
      let dh;
      if (params.senderKey === void 0) {
        dh = new Uint8Array(await this._prim.dh(ke.privateKey, params.recipientPublicKey));
      } else {
        const sks = isCryptoKeyPair(params.senderKey) ? params.senderKey.privateKey : params.senderKey;
        const dh1 = new Uint8Array(await this._prim.dh(ke.privateKey, params.recipientPublicKey));
        const dh2 = new Uint8Array(await this._prim.dh(sks, params.recipientPublicKey));
        dh = concat(dh1, dh2);
      }
      let kemContext;
      if (params.senderKey === void 0) {
        kemContext = concat(new Uint8Array(enc), new Uint8Array(pkrm));
      } else {
        const pks = isCryptoKeyPair(params.senderKey) ? params.senderKey.publicKey : await this._prim.derivePublicKey(params.senderKey);
        const pksm = await this._prim.serializePublicKey(pks);
        kemContext = concat3(new Uint8Array(enc), new Uint8Array(pkrm), new Uint8Array(pksm));
      }
      const sharedSecret = await this._generateSharedSecret(dh, kemContext);
      return {
        enc,
        sharedSecret
      };
    } catch (e) {
      throw new EncapError(e);
    }
  }
  async decap(params) {
    const enc = toArrayBuffer(params.enc);
    const pke = await this._prim.deserializePublicKey(enc);
    const skr = isCryptoKeyPair(params.recipientKey) ? params.recipientKey.privateKey : params.recipientKey;
    const pkr = isCryptoKeyPair(params.recipientKey) ? params.recipientKey.publicKey : await this._prim.derivePublicKey(params.recipientKey);
    const pkrm = await this._prim.serializePublicKey(pkr);
    try {
      let dh;
      if (params.senderPublicKey === void 0) {
        dh = new Uint8Array(await this._prim.dh(skr, pke));
      } else {
        const dh1 = new Uint8Array(await this._prim.dh(skr, pke));
        const dh2 = new Uint8Array(await this._prim.dh(skr, params.senderPublicKey));
        dh = concat(dh1, dh2);
      }
      let kemContext;
      if (params.senderPublicKey === void 0) {
        kemContext = concat(new Uint8Array(enc), new Uint8Array(pkrm));
      } else {
        const pksm = await this._prim.serializePublicKey(params.senderPublicKey);
        kemContext = new Uint8Array(enc.byteLength + pkrm.byteLength + pksm.byteLength);
        kemContext.set(new Uint8Array(enc), 0);
        kemContext.set(new Uint8Array(pkrm), enc.byteLength);
        kemContext.set(new Uint8Array(pksm), enc.byteLength + pkrm.byteLength);
      }
      return await this._generateSharedSecret(dh, kemContext);
    } catch (e) {
      throw new DecapError(e);
    }
  }
  async _generateSharedSecret(dh, kemContext) {
    const labeledIkm = this._kdf.buildLabeledIkm(LABEL_EAE_PRK, dh);
    const labeledInfo = this._kdf.buildLabeledInfo(LABEL_SHARED_SECRET, kemContext, this.secretSize);
    return await this._kdf.extractAndExpand(EMPTY, labeledIkm, labeledInfo, this.secretSize);
  }
};

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/interfaces/dhkemPrimitives.js
var KEM_USAGES = ["deriveBits"];
var LABEL_DKP_PRK = /* @__PURE__ */ new Uint8Array([
  100,
  107,
  112,
  95,
  112,
  114,
  107
]);

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/utils/bignum.js
var Bignum = class {
  constructor(size) {
    Object.defineProperty(this, "_num", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this._num = new Uint8Array(size);
  }
  val() {
    return this._num;
  }
  reset() {
    this._num.fill(0);
  }
  set(src) {
    if (src.length !== this._num.length) {
      throw new Error("Bignum.set: invalid argument");
    }
    this._num.set(src);
  }
  isZero() {
    for (let i = 0; i < this._num.length; i++) {
      if (this._num[i] !== 0) {
        return false;
      }
    }
    return true;
  }
  lessThan(v) {
    if (v.length !== this._num.length) {
      throw new Error("Bignum.lessThan: invalid argument");
    }
    for (let i = 0; i < this._num.length; i++) {
      if (this._num[i] < v[i]) {
        return true;
      }
      if (this._num[i] > v[i]) {
        return false;
      }
    }
    return false;
  }
};

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/kems/dhkemPrimitives/ec.js
var LABEL_CANDIDATE = /* @__PURE__ */ new Uint8Array([
  99,
  97,
  110,
  100,
  105,
  100,
  97,
  116,
  101
]);
var ORDER_P_256 = /* @__PURE__ */ new Uint8Array([
  255,
  255,
  255,
  255,
  0,
  0,
  0,
  0,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  188,
  230,
  250,
  173,
  167,
  23,
  158,
  132,
  243,
  185,
  202,
  194,
  252,
  99,
  37,
  81
]);
var ORDER_P_384 = /* @__PURE__ */ new Uint8Array([
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  199,
  99,
  77,
  129,
  244,
  55,
  45,
  223,
  88,
  26,
  13,
  178,
  72,
  176,
  167,
  122,
  236,
  236,
  25,
  106,
  204,
  197,
  41,
  115
]);
var ORDER_P_521 = /* @__PURE__ */ new Uint8Array([
  1,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  250,
  81,
  134,
  135,
  131,
  191,
  47,
  150,
  107,
  127,
  204,
  1,
  72,
  247,
  9,
  165,
  208,
  59,
  181,
  201,
  184,
  137,
  156,
  71,
  174,
  187,
  111,
  183,
  30,
  145,
  56,
  100,
  9
]);
var PKCS8_ALG_ID_P_256 = /* @__PURE__ */ new Uint8Array([
  48,
  65,
  2,
  1,
  0,
  48,
  19,
  6,
  7,
  42,
  134,
  72,
  206,
  61,
  2,
  1,
  6,
  8,
  42,
  134,
  72,
  206,
  61,
  3,
  1,
  7,
  4,
  39,
  48,
  37,
  2,
  1,
  1,
  4,
  32
]);
var PKCS8_ALG_ID_P_384 = /* @__PURE__ */ new Uint8Array([
  48,
  78,
  2,
  1,
  0,
  48,
  16,
  6,
  7,
  42,
  134,
  72,
  206,
  61,
  2,
  1,
  6,
  5,
  43,
  129,
  4,
  0,
  34,
  4,
  55,
  48,
  53,
  2,
  1,
  1,
  4,
  48
]);
var PKCS8_ALG_ID_P_521 = /* @__PURE__ */ new Uint8Array([
  48,
  96,
  2,
  1,
  0,
  48,
  16,
  6,
  7,
  42,
  134,
  72,
  206,
  61,
  2,
  1,
  6,
  5,
  43,
  129,
  4,
  0,
  35,
  4,
  73,
  48,
  71,
  2,
  1,
  1,
  4,
  66
]);
var EC_P_256_PARAMS = {
  p: 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn,
  b: 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn,
  gx: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n,
  gy: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n,
  coordinateSize: 32
};
var EC_P_384_PARAMS = {
  p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffffn,
  b: 0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aefn,
  gx: 0xaa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7n,
  gy: 0x3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5fn,
  coordinateSize: 48
};
var EC_P_521_PARAMS = {
  p: (1n << 521n) - 1n,
  b: 0x0051953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00n,
  gx: 0x00c6858e06b70404e9cd9e3ecb662395b4429c648139053fb521f828af606b4d3dbaa14b5e77efe75928fe1dc127a2ffa8de3348b3c1856a429bf97e7e31c2e5bd66n,
  gy: 0x011839296a789a3bc0045c8a5fb42c7d1bd998f54449579b446817afbd17273e662c97ee72995ef42640c550b9013fad0761353c7086a272c24088be94769fd16650n,
  coordinateSize: 66
};
function mod(a, p) {
  const r = a % p;
  return r >= 0n ? r : r + p;
}
function modPow(base, exponent, p) {
  let result = 1n;
  let b = mod(base, p);
  let e = exponent;
  while (e > 0n) {
    if ((e & 1n) === 1n) {
      result = mod(result * b, p);
    }
    b = mod(b * b, p);
    e >>= 1n;
  }
  return result;
}
function modSqrt(rhs, p) {
  const y = modPow(rhs, p + 1n >> 2n, p);
  if (mod(y * y, p) !== mod(rhs, p)) {
    throw new Error("Invalid ECDH point");
  }
  return y;
}
function bytesToBigInt(bytes) {
  let v = 0n;
  for (const b of bytes) {
    v = v << 8n | BYTE_TO_BIGINT_256[b];
  }
  return v;
}
function bigIntToBytes(v, len) {
  const out = new Uint8Array(len);
  let n = v;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  if (n !== 0n) {
    throw new Error("Invalid coordinate length");
  }
  return out;
}
function buildRawUncompressedPublicKey(x, y, coordinateSize) {
  const out = new Uint8Array(1 + coordinateSize * 2);
  out[0] = 4;
  out.set(bigIntToBytes(x, coordinateSize), 1);
  out.set(bigIntToBytes(y, coordinateSize), 1 + coordinateSize);
  return out;
}
var Ec = class extends NativeAlgorithm {
  constructor(kem, hkdf) {
    super();
    Object.defineProperty(this, "_hkdf", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_alg", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_nPk", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_nSk", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_nDh", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_order", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_bitmask", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_pkcs8AlgId", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_curveParams", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this._hkdf = hkdf;
    switch (kem) {
      case KemId.DhkemP256HkdfSha256:
        this._alg = { name: "ECDH", namedCurve: "P-256" };
        this._nPk = 65;
        this._nSk = 32;
        this._nDh = 32;
        this._order = ORDER_P_256;
        this._bitmask = 255;
        this._pkcs8AlgId = PKCS8_ALG_ID_P_256;
        this._curveParams = EC_P_256_PARAMS;
        break;
      case KemId.DhkemP384HkdfSha384:
        this._alg = { name: "ECDH", namedCurve: "P-384" };
        this._nPk = 97;
        this._nSk = 48;
        this._nDh = 48;
        this._order = ORDER_P_384;
        this._bitmask = 255;
        this._pkcs8AlgId = PKCS8_ALG_ID_P_384;
        this._curveParams = EC_P_384_PARAMS;
        break;
      default:
        this._alg = { name: "ECDH", namedCurve: "P-521" };
        this._nPk = 133;
        this._nSk = 66;
        this._nDh = 66;
        this._order = ORDER_P_521;
        this._bitmask = 1;
        this._pkcs8AlgId = PKCS8_ALG_ID_P_521;
        this._curveParams = EC_P_521_PARAMS;
        break;
    }
  }
  async serializePublicKey(key) {
    await this._setup();
    try {
      return await this._api.exportKey("raw", key);
    } catch (e) {
      throw new SerializeError(e);
    }
  }
  async deserializePublicKey(key) {
    await this._setup();
    try {
      return await this._importRawKey(toArrayBuffer(key), true);
    } catch (e) {
      throw new DeserializeError(e);
    }
  }
  async serializePrivateKey(key) {
    await this._setup();
    try {
      const jwk = await this._api.exportKey("jwk", key);
      if (!("d" in jwk)) {
        throw new Error("Not private key");
      }
      return base64UrlToBytes(jwk["d"]).buffer;
    } catch (e) {
      throw new SerializeError(e);
    }
  }
  async deserializePrivateKey(key) {
    await this._setup();
    try {
      return await this._importRawKey(toArrayBuffer(key), false);
    } catch (e) {
      throw new DeserializeError(e);
    }
  }
  async importKey(format, key, isPublic) {
    await this._setup();
    try {
      if (format === "raw") {
        return await this._importRawKey(key, isPublic);
      }
      if (key instanceof ArrayBuffer) {
        throw new Error("Invalid jwk key format");
      }
      return await this._importJWK(key, isPublic);
    } catch (e) {
      throw new DeserializeError(e);
    }
  }
  async generateKeyPair() {
    await this._setup();
    try {
      return await this._api.generateKey(this._alg, true, KEM_USAGES);
    } catch (e) {
      throw new NotSupportedError(e);
    }
  }
  async deriveKeyPair(ikm) {
    await this._setup();
    try {
      const rawIkm = toArrayBuffer(ikm);
      const dkpPrk = await this._hkdf.labeledExtract(EMPTY, LABEL_DKP_PRK, new Uint8Array(rawIkm));
      const bn = new Bignum(this._nSk);
      for (let counter = 0; bn.isZero() || !bn.lessThan(this._order); counter++) {
        if (counter > 255) {
          throw new Error("Faild to derive a key pair");
        }
        const bytes = new Uint8Array(await this._hkdf.labeledExpand(dkpPrk, LABEL_CANDIDATE, i2Osp(counter, 1), this._nSk));
        bytes[0] = bytes[0] & this._bitmask;
        bn.set(bytes);
      }
      const sk = await this._deserializePkcs8Key(bn.val());
      bn.reset();
      return {
        privateKey: sk,
        publicKey: await this.derivePublicKey(sk)
      };
    } catch (e) {
      throw new DeriveKeyPairError(e);
    }
  }
  async derivePublicKey(key) {
    await this._setup();
    try {
      const jwk = await this._api.exportKey("jwk", key);
      delete jwk["d"];
      delete jwk["key_ops"];
      return await this._api.importKey("jwk", jwk, this._alg, true, []);
    } catch {
      try {
        return await this._derivePublicKeyWithoutJwkExport(key);
      } catch (e) {
        throw new DeserializeError(e);
      }
    }
  }
  async dh(sk, pk) {
    try {
      await this._setup();
      const bits = await this._api.deriveBits({
        name: "ECDH",
        public: pk
      }, sk, this._nDh * 8);
      return bits;
    } catch (e) {
      throw new SerializeError(e);
    }
  }
  async _importRawKey(key, isPublic) {
    if (isPublic && key.byteLength !== this._nPk) {
      throw new Error("Invalid public key for the ciphersuite");
    }
    if (!isPublic && key.byteLength !== this._nSk) {
      throw new Error("Invalid private key for the ciphersuite");
    }
    if (isPublic) {
      return await this._api.importKey("raw", key, this._alg, true, []);
    }
    return await this._deserializePkcs8Key(new Uint8Array(key));
  }
  async _importJWK(key, isPublic) {
    if (typeof key.crv === "undefined" || key.crv !== this._alg.namedCurve) {
      throw new Error(`Invalid crv: ${key.crv}`);
    }
    if (isPublic) {
      if (typeof key.d !== "undefined") {
        throw new Error("Invalid key: `d` should not be set");
      }
      return await this._api.importKey("jwk", key, this._alg, true, []);
    }
    if (typeof key.d === "undefined") {
      throw new Error("Invalid key: `d` not found");
    }
    return await this._api.importKey("jwk", key, this._alg, true, KEM_USAGES);
  }
  async _deserializePkcs8Key(k) {
    const pkcs8Key = new Uint8Array(this._pkcs8AlgId.length + k.length);
    pkcs8Key.set(this._pkcs8AlgId, 0);
    pkcs8Key.set(k, this._pkcs8AlgId.length);
    return await this._api.importKey("pkcs8", pkcs8Key, this._alg, true, KEM_USAGES);
  }
  async _derivePublicKeyWithoutJwkExport(key) {
    const basePointRaw = buildRawUncompressedPublicKey(this._curveParams.gx, this._curveParams.gy, this._curveParams.coordinateSize);
    const basePoint = await this._api.importKey("raw", basePointRaw.buffer, this._alg, true, []);
    const xBytes = new Uint8Array(await this._api.deriveBits({
      name: "ECDH",
      public: basePoint
    }, key, this._nDh * 8));
    const p = this._curveParams.p;
    const x = bytesToBigInt(xBytes);
    const rhs = mod(modPow(x, 3n, p) - 3n * x + this._curveParams.b, p);
    let y = modSqrt(rhs, p);
    if ((y & 1n) === 1n) {
      y = p - y;
    }
    const pubRaw = buildRawUncompressedPublicKey(x, y, this._curveParams.coordinateSize);
    return await this._api.importKey("raw", pubRaw.buffer, this._alg, true, []);
  }
};

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/interfaces/aeadEncryptionContext.js
var AEAD_USAGES = ["encrypt", "decrypt"];

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/utils/noble.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n, title = "") {
  if (!Number.isSafeInteger(n) || n < 0) {
    const prefix = title && `"${title}" `;
    throw new Error(`${prefix}expected integer >0, got ${n}`);
  }
}
function abytes(value, length, title = "") {
  const bytes = isBytes(value);
  const len = value?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value}`;
    throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
  }
  return value;
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished) {
    throw new Error("Hash#digest() has already been called");
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
var _endianTestBuffer = /* @__PURE__ */ new Uint32Array([287454020]);
var _endianTestBytes = /* @__PURE__ */ new Uint8Array(_endianTestBuffer.buffer);
var isLE = _endianTestBytes[0] === 68;

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/hash/hash.js
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function") {
    throw new Error("Hash must wrapped by utils.createHasher");
  }
  anumber(h.outputLen);
  anumber(h.blockLen);
}

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/hash/hmac.js
var _HMAC = class {
  constructor(hash, key) {
    Object.defineProperty(this, "oHash", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "iHash", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "blockLen", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "outputLen", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "finished", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: false
    });
    Object.defineProperty(this, "destroyed", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: false
    });
    ahash(hash);
    abytes(key, void 0, "key");
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function") {
      throw new Error("Expected instance of class which extends utils.Hash");
    }
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash.create();
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54 ^ 92;
    this.oHash.update(pad);
    clean(pad);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    abytes(out, this.outputLen, "output");
    this.finished = true;
    this.iHash.digestInto(out);
    this.oHash.update(out);
    this.oHash.digestInto(out);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to ||= Object.create(Object.getPrototypeOf(this), {});
    const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = (hash, key, message) => new _HMAC(hash, key).update(message).digest();
hmac.create = (hash, key) => new _HMAC(hash, key);

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/hash/u64.js
var U32_MASK64 = 0xffffffffn;
var _32n = 32n;
function fromBig(n, le = false) {
  if (le) {
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  }
  return {
    h: Number(n >> _32n & U32_MASK64) | 0,
    l: Number(n & U32_MASK64) | 0
  };
}
function split(lst, le = false) {
  const len = lst.length;
  const Ah = new Uint32Array(len);
  const Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}

// ../users-remote-service-20261011/node_modules/@hpke/common/esm/src/hash/sha3.js
var _0n = 0n;
var _1n = 1n;
var _2n = 2n;
var _7n = 7n;
var _256n = 256n;
var _0x71n = 0x71n;
var SHA3_PI = [];
var SHA3_ROTL = [];
var _SHA3_IOTA = [];
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
  [x, y] = [y, (2 * x + 3 * y) % 5];
  SHA3_PI.push(2 * (5 * y + x));
  SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
  let t = _0n;
  for (let j = 0; j < 7; j++) {
    R = (R << _1n ^ (R >> _7n) * _0x71n) % _256n;
    if (R & _2n)
      t ^= _1n << (_1n << BigInt(j)) - _1n;
  }
  _SHA3_IOTA.push(t);
}
var IOTAS = split(_SHA3_IOTA, true);
var SHA3_IOTA_H = IOTAS[0];
var SHA3_IOTA_L = IOTAS[1];

// ../users-remote-service-20261011/node_modules/@hpke/core/esm/src/aeads/aesGcm.js
var AesGcmContext = class extends NativeAlgorithm {
  constructor(key) {
    super();
    Object.defineProperty(this, "_rawKey", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_key", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this._rawKey = toArrayBuffer(key);
  }
  async seal(iv, data, aad) {
    await this._setupKey();
    const alg = {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(aad)
    };
    const ct = await this._api.encrypt(alg, this._key, toArrayBuffer(data));
    return ct;
  }
  async open(iv, data, aad) {
    await this._setupKey();
    const alg = {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(aad)
    };
    const pt = await this._api.decrypt(alg, this._key, toArrayBuffer(data));
    return pt;
  }
  async _setupKey() {
    if (this._key !== void 0) {
      return;
    }
    await this._setup();
    const key = await this._importKey(this._rawKey);
    new Uint8Array(this._rawKey).fill(0);
    this._key = key;
    return;
  }
  async _importKey(key) {
    return await this._api.importKey("raw", key, { name: "AES-GCM" }, true, AEAD_USAGES);
  }
};
var Aes128Gcm = class {
  constructor() {
    Object.defineProperty(this, "id", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: AeadId.Aes128Gcm
    });
    Object.defineProperty(this, "keySize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 16
    });
    Object.defineProperty(this, "nonceSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 12
    });
    Object.defineProperty(this, "tagSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 16
    });
  }
  createEncryptionContext(key) {
    return new AesGcmContext(key);
  }
};
var Aes256Gcm = class extends Aes128Gcm {
  constructor() {
    super(...arguments);
    Object.defineProperty(this, "id", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: AeadId.Aes256Gcm
    });
    Object.defineProperty(this, "keySize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 32
    });
    Object.defineProperty(this, "nonceSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 12
    });
    Object.defineProperty(this, "tagSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 16
    });
  }
};

// ../users-remote-service-20261011/node_modules/@hpke/core/esm/src/utils/emitNotSupported.js
function emitNotSupported() {
  return new Promise((_resolve, reject) => {
    reject(new NotSupportedError("Not supported"));
  });
}

// ../users-remote-service-20261011/node_modules/@hpke/core/esm/src/exporterContext.js
var LABEL_SEC = new Uint8Array([115, 101, 99]);
var ExporterContextImpl = class {
  constructor(api, kdf, exporterSecret) {
    Object.defineProperty(this, "_api", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "exporterSecret", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_kdf", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this._api = api;
    this._kdf = kdf;
    this.exporterSecret = exporterSecret;
  }
  async seal(_data, _aad) {
    return await emitNotSupported();
  }
  async open(_data, _aad) {
    return await emitNotSupported();
  }
  async export(exporterContext, len) {
    const rawExporterContext = toArrayBuffer(exporterContext);
    if (rawExporterContext.byteLength > INPUT_LENGTH_LIMIT) {
      throw new InvalidParamError("Too long exporter context");
    }
    try {
      return await this._kdf.labeledExpand(this.exporterSecret, LABEL_SEC, new Uint8Array(rawExporterContext), len);
    } catch (e) {
      throw new ExportError(e);
    }
  }
};
var RecipientExporterContextImpl = class extends ExporterContextImpl {
};
var SenderExporterContextImpl = class extends ExporterContextImpl {
  constructor(api, kdf, exporterSecret, enc) {
    super(api, kdf, exporterSecret);
    Object.defineProperty(this, "enc", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.enc = enc;
    return;
  }
};

// ../users-remote-service-20261011/node_modules/@hpke/core/esm/src/encryptionContext.js
var EncryptionContextImpl = class extends ExporterContextImpl {
  constructor(api, kdf, params) {
    super(api, kdf, params.exporterSecret);
    Object.defineProperty(this, "_aead", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_nK", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_nN", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_nT", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_ctx", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    if (params.key === void 0 || params.baseNonce === void 0 || params.seq === void 0) {
      throw new Error("Required parameters are missing");
    }
    this._aead = params.aead;
    this._nK = this._aead.keySize;
    this._nN = this._aead.nonceSize;
    this._nT = this._aead.tagSize;
    const key = this._aead.createEncryptionContext(params.key);
    this._ctx = {
      key,
      baseNonce: params.baseNonce,
      seq: params.seq
    };
  }
  computeNonce(k) {
    const seqBytes = i2Osp(k.seq, k.baseNonce.byteLength);
    return xor(k.baseNonce, seqBytes).buffer;
  }
  incrementSeq(k) {
    if (k.seq > Number.MAX_SAFE_INTEGER) {
      throw new MessageLimitReachedError("Message limit reached");
    }
    k.seq += 1;
    return;
  }
};

// ../users-remote-service-20261011/node_modules/@hpke/core/esm/src/mutex.js
var __classPrivateFieldGet = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var _Mutex_locked;
var Mutex = class {
  constructor() {
    _Mutex_locked.set(this, Promise.resolve());
  }
  async lock() {
    let releaseLock;
    const nextLock = new Promise((resolve) => {
      releaseLock = resolve;
    });
    const previousLock = __classPrivateFieldGet(this, _Mutex_locked, "f");
    __classPrivateFieldSet(this, _Mutex_locked, nextLock, "f");
    await previousLock;
    return releaseLock;
  }
};
_Mutex_locked = /* @__PURE__ */ new WeakMap();

// ../users-remote-service-20261011/node_modules/@hpke/core/esm/src/recipientContext.js
var __classPrivateFieldGet2 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet2 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var _RecipientContextImpl_mutex;
var RecipientContextImpl = class extends EncryptionContextImpl {
  constructor() {
    super(...arguments);
    _RecipientContextImpl_mutex.set(this, void 0);
  }
  async open(data, aad = EMPTY.buffer) {
    __classPrivateFieldSet2(this, _RecipientContextImpl_mutex, __classPrivateFieldGet2(this, _RecipientContextImpl_mutex, "f") ?? new Mutex(), "f");
    const release = await __classPrivateFieldGet2(this, _RecipientContextImpl_mutex, "f").lock();
    let pt;
    try {
      pt = await this._ctx.key.open(this.computeNonce(this._ctx), toArrayBuffer(data), toArrayBuffer(aad));
    } catch (e) {
      throw new OpenError(e);
    } finally {
      release();
    }
    this.incrementSeq(this._ctx);
    return pt;
  }
};
_RecipientContextImpl_mutex = /* @__PURE__ */ new WeakMap();

// ../users-remote-service-20261011/node_modules/@hpke/core/esm/src/senderContext.js
var __classPrivateFieldGet3 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet3 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var _SenderContextImpl_mutex;
var SenderContextImpl = class extends EncryptionContextImpl {
  constructor(api, kdf, params, enc) {
    super(api, kdf, params);
    Object.defineProperty(this, "enc", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    _SenderContextImpl_mutex.set(this, void 0);
    this.enc = enc;
  }
  async seal(data, aad = EMPTY.buffer) {
    __classPrivateFieldSet3(this, _SenderContextImpl_mutex, __classPrivateFieldGet3(this, _SenderContextImpl_mutex, "f") ?? new Mutex(), "f");
    const release = await __classPrivateFieldGet3(this, _SenderContextImpl_mutex, "f").lock();
    let ct;
    try {
      ct = await this._ctx.key.seal(this.computeNonce(this._ctx), toArrayBuffer(data), toArrayBuffer(aad));
    } catch (e) {
      throw new SealError(e);
    } finally {
      release();
    }
    this.incrementSeq(this._ctx);
    return ct;
  }
};
_SenderContextImpl_mutex = /* @__PURE__ */ new WeakMap();

// ../users-remote-service-20261011/node_modules/@hpke/core/esm/src/cipherSuiteNative.js
var LABEL_BASE_NONCE = new Uint8Array([
  98,
  97,
  115,
  101,
  95,
  110,
  111,
  110,
  99,
  101
]);
var LABEL_EXP = new Uint8Array([101, 120, 112]);
var LABEL_INFO_HASH = new Uint8Array([
  105,
  110,
  102,
  111,
  95,
  104,
  97,
  115,
  104
]);
var LABEL_KEY = new Uint8Array([107, 101, 121]);
var LABEL_PSK_ID_HASH = new Uint8Array([
  112,
  115,
  107,
  95,
  105,
  100,
  95,
  104,
  97,
  115,
  104
]);
var LABEL_SECRET = new Uint8Array([115, 101, 99, 114, 101, 116]);
var SUITE_ID_HEADER_HPKE = new Uint8Array([
  72,
  80,
  75,
  69,
  0,
  0,
  0,
  0,
  0,
  0
]);
var CipherSuiteNative = class extends NativeAlgorithm {
  /**
   * @param params A set of parameters for building a cipher suite.
   *
   * If the error occurred, throws {@link InvalidParamError}.
   *
   * @throws {@link InvalidParamError}
   */
  constructor(params) {
    super();
    Object.defineProperty(this, "_kem", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_kdf", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_aead", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_suiteId", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    if (typeof params.kem === "number") {
      throw new InvalidParamError("KemId cannot be used");
    }
    this._kem = params.kem;
    if (typeof params.kdf === "number") {
      throw new InvalidParamError("KdfId cannot be used");
    }
    this._kdf = params.kdf;
    if (typeof params.aead === "number") {
      throw new InvalidParamError("AeadId cannot be used");
    }
    this._aead = params.aead;
    this._suiteId = new Uint8Array(SUITE_ID_HEADER_HPKE);
    this._suiteId.set(i2Osp(this._kem.id, 2), 4);
    this._suiteId.set(i2Osp(this._kdf.id, 2), 6);
    this._suiteId.set(i2Osp(this._aead.id, 2), 8);
    this._kdf.init(this._suiteId);
  }
  /**
   * Gets the KEM context of the ciphersuite.
   */
  get kem() {
    return this._kem;
  }
  /**
   * Gets the KDF context of the ciphersuite.
   */
  get kdf() {
    return this._kdf;
  }
  /**
   * Gets the AEAD context of the ciphersuite.
   */
  get aead() {
    return this._aead;
  }
  /**
   * Creates an encryption context for a sender.
   *
   * If the error occurred, throws {@link DecapError} | {@link ValidationError}.
   *
   * @param params A set of parameters for the sender encryption context.
   * @returns A sender encryption context.
   * @throws {@link EncapError}, {@link ValidationError}
   */
  async createSenderContext(params) {
    this._validateInputLength(params);
    await this._setup();
    const dh = await this._kem.encap(params);
    let mode;
    if (params.psk !== void 0) {
      mode = params.senderKey !== void 0 ? Mode.AuthPsk : Mode.Psk;
    } else {
      mode = params.senderKey !== void 0 ? Mode.Auth : Mode.Base;
    }
    return await this._keyScheduleS(mode, dh.sharedSecret, dh.enc, params);
  }
  /**
   * Creates an encryption context for a recipient.
   *
   * If the error occurred, throws {@link DecapError}
   * | {@link DeserializeError} | {@link ValidationError}.
   *
   * @param params A set of parameters for the recipient encryption context.
   * @returns A recipient encryption context.
   * @throws {@link DecapError}, {@link DeserializeError}, {@link ValidationError}
   */
  async createRecipientContext(params) {
    this._validateInputLength(params);
    await this._setup();
    const sharedSecret = await this._kem.decap(params);
    let mode;
    if (params.psk !== void 0) {
      mode = params.senderPublicKey !== void 0 ? Mode.AuthPsk : Mode.Psk;
    } else {
      mode = params.senderPublicKey !== void 0 ? Mode.Auth : Mode.Base;
    }
    return await this._keyScheduleR(mode, sharedSecret, params);
  }
  /**
   * Encrypts a message to a recipient.
   *
   * If the error occurred, throws `EncapError` | `MessageLimitReachedError` | `SealError` | `ValidationError`.
   *
   * @param params A set of parameters for building a sender encryption context.
   * @param pt A plain text as bytes to be encrypted.
   * @param aad Additional authenticated data as bytes fed by an application.
   * @returns A cipher text and an encapsulated key as bytes.
   * @throws {@link EncapError}, {@link MessageLimitReachedError}, {@link SealError}, {@link ValidationError}
   */
  async seal(params, pt, aad = EMPTY.buffer) {
    const ctx = await this.createSenderContext(params);
    return {
      ct: await ctx.seal(pt, aad),
      enc: ctx.enc
    };
  }
  /**
   * Decrypts a message from a sender.
   *
   * If the error occurred, throws `DecapError` | `DeserializeError` | `OpenError` | `ValidationError`.
   *
   * @param params A set of parameters for building a recipient encryption context.
   * @param ct An encrypted text as bytes to be decrypted.
   * @param aad Additional authenticated data as bytes fed by an application.
   * @returns A decrypted plain text as bytes.
   * @throws {@link DecapError}, {@link DeserializeError}, {@link OpenError}, {@link ValidationError}
   */
  async open(params, ct, aad = EMPTY.buffer) {
    const ctx = await this.createRecipientContext(params);
    return await ctx.open(ct, aad);
  }
  // private verifyPskInputs(mode: Mode, params: KeyScheduleParams) {
  //   const gotPsk = (params.psk !== undefined);
  //   const gotPskId = (params.psk !== undefined && params.psk.id.byteLength > 0);
  //   if (gotPsk !== gotPskId) {
  //     throw new Error('Inconsistent PSK inputs');
  //   }
  //   if (gotPsk && (mode === Mode.Base || mode === Mode.Auth)) {
  //     throw new Error('PSK input provided when not needed');
  //   }
  //   if (!gotPsk && (mode === Mode.Psk || mode === Mode.AuthPsk)) {
  //     throw new Error('Missing required PSK input');
  //   }
  //   return;
  // }
  async _keySchedule(mode, sharedSecret, params) {
    const pskId = params.psk === void 0 ? EMPTY : toUint8Array(params.psk.id);
    const pskIdHash = await this._kdf.labeledExtract(EMPTY, LABEL_PSK_ID_HASH, pskId);
    const info = params.info === void 0 ? EMPTY : toUint8Array(params.info);
    const infoHash = await this._kdf.labeledExtract(EMPTY, LABEL_INFO_HASH, info);
    const keyScheduleContext = new Uint8Array(1 + pskIdHash.byteLength + infoHash.byteLength);
    keyScheduleContext.set(new Uint8Array([mode]), 0);
    keyScheduleContext.set(new Uint8Array(pskIdHash), 1);
    keyScheduleContext.set(new Uint8Array(infoHash), 1 + pskIdHash.byteLength);
    const psk = params.psk === void 0 ? EMPTY : toUint8Array(params.psk.key);
    const ikm = this._kdf.buildLabeledIkm(LABEL_SECRET, psk);
    const exporterSecretInfo = this._kdf.buildLabeledInfo(LABEL_EXP, keyScheduleContext, this._kdf.hashSize);
    const exporterSecret = await this._kdf.extractAndExpand(sharedSecret, ikm, exporterSecretInfo, this._kdf.hashSize);
    if (this._aead.id === AeadId.ExportOnly) {
      return { aead: this._aead, exporterSecret };
    }
    const keyInfo = this._kdf.buildLabeledInfo(LABEL_KEY, keyScheduleContext, this._aead.keySize);
    const key = await this._kdf.extractAndExpand(sharedSecret, ikm, keyInfo, this._aead.keySize);
    const baseNonceInfo = this._kdf.buildLabeledInfo(LABEL_BASE_NONCE, keyScheduleContext, this._aead.nonceSize);
    const baseNonce = await this._kdf.extractAndExpand(sharedSecret, ikm, baseNonceInfo, this._aead.nonceSize);
    return {
      aead: this._aead,
      exporterSecret,
      key,
      baseNonce: new Uint8Array(baseNonce),
      seq: 0
    };
  }
  async _keyScheduleS(mode, sharedSecret, enc, params) {
    const res = await this._keySchedule(mode, sharedSecret, params);
    if (res.key === void 0) {
      return new SenderExporterContextImpl(this._api, this._kdf, res.exporterSecret, enc);
    }
    return new SenderContextImpl(this._api, this._kdf, res, enc);
  }
  async _keyScheduleR(mode, sharedSecret, params) {
    const res = await this._keySchedule(mode, sharedSecret, params);
    if (res.key === void 0) {
      return new RecipientExporterContextImpl(this._api, this._kdf, res.exporterSecret);
    }
    return new RecipientContextImpl(this._api, this._kdf, res);
  }
  _validateInputLength(params) {
    if (params.info !== void 0 && params.info.byteLength > INFO_LENGTH_LIMIT) {
      throw new InvalidParamError("Too long info");
    }
    if (params.psk !== void 0) {
      if (params.psk.key.byteLength < MINIMUM_PSK_LENGTH) {
        throw new InvalidParamError(`PSK must have at least ${MINIMUM_PSK_LENGTH} bytes`);
      }
      if (params.psk.key.byteLength > INPUT_LENGTH_LIMIT) {
        throw new InvalidParamError("Too long psk.key");
      }
      if (params.psk.id.byteLength > INPUT_LENGTH_LIMIT) {
        throw new InvalidParamError("Too long psk.id");
      }
    }
    return;
  }
};

// ../users-remote-service-20261011/node_modules/@hpke/core/esm/src/kems/dhkemNative.js
var DhkemP256HkdfSha256Native = class extends Dhkem {
  constructor() {
    const kdf = new HkdfSha256Native();
    const prim = new Ec(KemId.DhkemP256HkdfSha256, kdf);
    super(KemId.DhkemP256HkdfSha256, prim, kdf);
    Object.defineProperty(this, "id", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: KemId.DhkemP256HkdfSha256
    });
    Object.defineProperty(this, "secretSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 32
    });
    Object.defineProperty(this, "encSize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 65
    });
    Object.defineProperty(this, "publicKeySize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 65
    });
    Object.defineProperty(this, "privateKeySize", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 32
    });
  }
};

// ../users-remote-service-20261011/node_modules/@hpke/core/esm/src/native.js
var CipherSuite = class extends CipherSuiteNative {
};
var DhkemP256HkdfSha256 = class extends DhkemP256HkdfSha256Native {
};
var HkdfSha256 = class extends HkdfSha256Native {
};

// ../users-remote-service-20261011/node_modules/@hpke/core/esm/src/kems/dhkemPrimitives/x25519.js
var PKCS8_ALG_ID_X25519 = new Uint8Array([
  48,
  46,
  2,
  1,
  0,
  48,
  5,
  6,
  3,
  43,
  101,
  110,
  4,
  34,
  4,
  32
]);

// ../users-remote-service-20261011/node_modules/@hpke/core/esm/src/kems/dhkemPrimitives/x448.js
var PKCS8_ALG_ID_X448 = new Uint8Array([
  48,
  70,
  2,
  1,
  0,
  48,
  5,
  6,
  3,
  43,
  101,
  111,
  4,
  58,
  4,
  56
]);

// ../users-remote-service-20261011/src/contracts.ts
var RemoteGrant = validate10;
var schema13 = { "type": "object", "additionalProperties": false, "required": ["grantId", "ownerUserId", "hostId", "controllerId", "projectIds", "operations", "allowedNativeProfiles", "projectBindingVersions", "nativeCatalogDigest", "policyVersion", "grantVersion", "expiresAt", "hostKeyFingerprint", "controllerKeyFingerprint"], "properties": { "grantId": { "$ref": "#/definitions/UUID" }, "ownerUserId": { "$ref": "#/definitions/UUID" }, "hostId": { "$ref": "#/definitions/UUID" }, "controllerId": { "$ref": "#/definitions/UUID" }, "projectIds": { "type": "array", "minItems": 1, "maxItems": 100, "uniqueItems": true, "items": { "$ref": "#/definitions/OpaqueId" } }, "operations": { "type": "array", "minItems": 1, "maxItems": 5, "uniqueItems": true, "items": { "$ref": "#/definitions/RemoteOperation" } }, "allowedNativeProfiles": { "type": "array", "maxItems": 20, "uniqueItems": true, "items": { "$ref": "#/definitions/OpaqueId" } }, "projectBindingVersions": { "type": "object", "minProperties": 1, "maxProperties": 100, "propertyNames": { "$ref": "#/definitions/OpaqueId" }, "additionalProperties": { "$ref": "#/definitions/Version" } }, "nativeCatalogDigest": { "type": ["string", "null"], "pattern": "^[a-f0-9]{64}$" }, "policyVersion": { "$ref": "#/definitions/Version" }, "grantVersion": { "$ref": "#/definitions/Version" }, "expiresAt": { "type": "string", "format": "date-time" }, "hostKeyFingerprint": { "$ref": "#/definitions/Fingerprint" }, "controllerKeyFingerprint": { "$ref": "#/definitions/Fingerprint" } } };
var schema19 = { "type": "string", "enum": ["project.list", "conversation.read", "run.start", "run.stop", "run.approve"] };
var func2 = Object.prototype.hasOwnProperty;
var func3 = require_ucs2length().default;
var func0 = require_equal().default;
var formats0 = /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
var formats8 = require_formats().fullFormats["date-time"];
var pattern0 = new RegExp("^[a-zA-Z0-9_-]+$", "u");
var pattern3 = new RegExp("^[a-f0-9]{64}$", "u");
function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.grantId === void 0 && (missing0 = "grantId") || data.ownerUserId === void 0 && (missing0 = "ownerUserId") || data.hostId === void 0 && (missing0 = "hostId") || data.controllerId === void 0 && (missing0 = "controllerId") || data.projectIds === void 0 && (missing0 = "projectIds") || data.operations === void 0 && (missing0 = "operations") || data.allowedNativeProfiles === void 0 && (missing0 = "allowedNativeProfiles") || data.projectBindingVersions === void 0 && (missing0 = "projectBindingVersions") || data.nativeCatalogDigest === void 0 && (missing0 = "nativeCatalogDigest") || data.policyVersion === void 0 && (missing0 = "policyVersion") || data.grantVersion === void 0 && (missing0 = "grantVersion") || data.expiresAt === void 0 && (missing0 = "expiresAt") || data.hostKeyFingerprint === void 0 && (missing0 = "hostKeyFingerprint") || data.controllerKeyFingerprint === void 0 && (missing0 = "controllerKeyFingerprint")) {
        validate12.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" }];
        return false;
      } else {
        const _errs1 = errors;
        for (const key0 in data) {
          if (!func2.call(schema13.properties, key0)) {
            validate12.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" }];
            return false;
            break;
          }
        }
        if (_errs1 === errors) {
          if (data.grantId !== void 0) {
            let data0 = data.grantId;
            const _errs2 = errors;
            const _errs3 = errors;
            if (errors === _errs3) {
              if (errors === _errs3) {
                if (typeof data0 === "string") {
                  if (!formats0.test(data0)) {
                    validate12.errors = [{ instancePath: instancePath + "/grantId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                    return false;
                  }
                } else {
                  validate12.errors = [{ instancePath: instancePath + "/grantId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                  return false;
                }
              }
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.ownerUserId !== void 0) {
              let data1 = data.ownerUserId;
              const _errs5 = errors;
              const _errs6 = errors;
              if (errors === _errs6) {
                if (errors === _errs6) {
                  if (typeof data1 === "string") {
                    if (!formats0.test(data1)) {
                      validate12.errors = [{ instancePath: instancePath + "/ownerUserId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                      return false;
                    }
                  } else {
                    validate12.errors = [{ instancePath: instancePath + "/ownerUserId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                    return false;
                  }
                }
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.hostId !== void 0) {
                let data2 = data.hostId;
                const _errs8 = errors;
                const _errs9 = errors;
                if (errors === _errs9) {
                  if (errors === _errs9) {
                    if (typeof data2 === "string") {
                      if (!formats0.test(data2)) {
                        validate12.errors = [{ instancePath: instancePath + "/hostId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                        return false;
                      }
                    } else {
                      validate12.errors = [{ instancePath: instancePath + "/hostId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                      return false;
                    }
                  }
                }
                var valid0 = _errs8 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.controllerId !== void 0) {
                  let data3 = data.controllerId;
                  const _errs11 = errors;
                  const _errs12 = errors;
                  if (errors === _errs12) {
                    if (errors === _errs12) {
                      if (typeof data3 === "string") {
                        if (!formats0.test(data3)) {
                          validate12.errors = [{ instancePath: instancePath + "/controllerId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                          return false;
                        }
                      } else {
                        validate12.errors = [{ instancePath: instancePath + "/controllerId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                        return false;
                      }
                    }
                  }
                  var valid0 = _errs11 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.projectIds !== void 0) {
                    let data4 = data.projectIds;
                    const _errs14 = errors;
                    if (errors === _errs14) {
                      if (Array.isArray(data4)) {
                        if (data4.length > 100) {
                          validate12.errors = [{ instancePath: instancePath + "/projectIds", schemaPath: "#/properties/projectIds/maxItems", keyword: "maxItems", params: { limit: 100 }, message: "must NOT have more than 100 items" }];
                          return false;
                        } else {
                          if (data4.length < 1) {
                            validate12.errors = [{ instancePath: instancePath + "/projectIds", schemaPath: "#/properties/projectIds/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" }];
                            return false;
                          } else {
                            var valid5 = true;
                            const len0 = data4.length;
                            for (let i0 = 0; i0 < len0; i0++) {
                              let data5 = data4[i0];
                              const _errs16 = errors;
                              const _errs17 = errors;
                              if (errors === _errs17) {
                                if (typeof data5 === "string") {
                                  if (func3(data5) > 128) {
                                    validate12.errors = [{ instancePath: instancePath + "/projectIds/" + i0, schemaPath: "#/definitions/OpaqueId/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" }];
                                    return false;
                                  } else {
                                    if (func3(data5) < 1) {
                                      validate12.errors = [{ instancePath: instancePath + "/projectIds/" + i0, schemaPath: "#/definitions/OpaqueId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" }];
                                      return false;
                                    } else {
                                      if (!pattern0.test(data5)) {
                                        validate12.errors = [{ instancePath: instancePath + "/projectIds/" + i0, schemaPath: "#/definitions/OpaqueId/pattern", keyword: "pattern", params: { pattern: "^[a-zA-Z0-9_-]+$" }, message: 'must match pattern "^[a-zA-Z0-9_-]+$"' }];
                                        return false;
                                      }
                                    }
                                  }
                                } else {
                                  validate12.errors = [{ instancePath: instancePath + "/projectIds/" + i0, schemaPath: "#/definitions/OpaqueId/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                  return false;
                                }
                              }
                              var valid5 = _errs16 === errors;
                              if (!valid5) {
                                break;
                              }
                            }
                            if (valid5) {
                              let i1 = data4.length;
                              let j0;
                              if (i1 > 1) {
                                outer0: for (; i1--; ) {
                                  for (j0 = i1; j0--; ) {
                                    if (func0(data4[i1], data4[j0])) {
                                      validate12.errors = [{ instancePath: instancePath + "/projectIds", schemaPath: "#/properties/projectIds/uniqueItems", keyword: "uniqueItems", params: { i: i1, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i1 + " are identical)" }];
                                      return false;
                                      break outer0;
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      } else {
                        validate12.errors = [{ instancePath: instancePath + "/projectIds", schemaPath: "#/properties/projectIds/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                        return false;
                      }
                    }
                    var valid0 = _errs14 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.operations !== void 0) {
                      let data6 = data.operations;
                      const _errs19 = errors;
                      if (errors === _errs19) {
                        if (Array.isArray(data6)) {
                          if (data6.length > 5) {
                            validate12.errors = [{ instancePath: instancePath + "/operations", schemaPath: "#/properties/operations/maxItems", keyword: "maxItems", params: { limit: 5 }, message: "must NOT have more than 5 items" }];
                            return false;
                          } else {
                            if (data6.length < 1) {
                              validate12.errors = [{ instancePath: instancePath + "/operations", schemaPath: "#/properties/operations/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" }];
                              return false;
                            } else {
                              var valid8 = true;
                              const len1 = data6.length;
                              for (let i2 = 0; i2 < len1; i2++) {
                                let data7 = data6[i2];
                                const _errs21 = errors;
                                if (typeof data7 !== "string") {
                                  validate12.errors = [{ instancePath: instancePath + "/operations/" + i2, schemaPath: "#/definitions/RemoteOperation/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                  return false;
                                }
                                if (!(data7 === "project.list" || data7 === "conversation.read" || data7 === "run.start" || data7 === "run.stop" || data7 === "run.approve")) {
                                  validate12.errors = [{ instancePath: instancePath + "/operations/" + i2, schemaPath: "#/definitions/RemoteOperation/enum", keyword: "enum", params: { allowedValues: schema19.enum }, message: "must be equal to one of the allowed values" }];
                                  return false;
                                }
                                var valid8 = _errs21 === errors;
                                if (!valid8) {
                                  break;
                                }
                              }
                              if (valid8) {
                                let i3 = data6.length;
                                let j1;
                                if (i3 > 1) {
                                  outer1: for (; i3--; ) {
                                    for (j1 = i3; j1--; ) {
                                      if (func0(data6[i3], data6[j1])) {
                                        validate12.errors = [{ instancePath: instancePath + "/operations", schemaPath: "#/properties/operations/uniqueItems", keyword: "uniqueItems", params: { i: i3, j: j1 }, message: "must NOT have duplicate items (items ## " + j1 + " and " + i3 + " are identical)" }];
                                        return false;
                                        break outer1;
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        } else {
                          validate12.errors = [{ instancePath: instancePath + "/operations", schemaPath: "#/properties/operations/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                          return false;
                        }
                      }
                      var valid0 = _errs19 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.allowedNativeProfiles !== void 0) {
                        let data8 = data.allowedNativeProfiles;
                        const _errs24 = errors;
                        if (errors === _errs24) {
                          if (Array.isArray(data8)) {
                            if (data8.length > 20) {
                              validate12.errors = [{ instancePath: instancePath + "/allowedNativeProfiles", schemaPath: "#/properties/allowedNativeProfiles/maxItems", keyword: "maxItems", params: { limit: 20 }, message: "must NOT have more than 20 items" }];
                              return false;
                            } else {
                              var valid11 = true;
                              const len2 = data8.length;
                              for (let i4 = 0; i4 < len2; i4++) {
                                let data9 = data8[i4];
                                const _errs26 = errors;
                                const _errs27 = errors;
                                if (errors === _errs27) {
                                  if (typeof data9 === "string") {
                                    if (func3(data9) > 128) {
                                      validate12.errors = [{ instancePath: instancePath + "/allowedNativeProfiles/" + i4, schemaPath: "#/definitions/OpaqueId/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" }];
                                      return false;
                                    } else {
                                      if (func3(data9) < 1) {
                                        validate12.errors = [{ instancePath: instancePath + "/allowedNativeProfiles/" + i4, schemaPath: "#/definitions/OpaqueId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" }];
                                        return false;
                                      } else {
                                        if (!pattern0.test(data9)) {
                                          validate12.errors = [{ instancePath: instancePath + "/allowedNativeProfiles/" + i4, schemaPath: "#/definitions/OpaqueId/pattern", keyword: "pattern", params: { pattern: "^[a-zA-Z0-9_-]+$" }, message: 'must match pattern "^[a-zA-Z0-9_-]+$"' }];
                                          return false;
                                        }
                                      }
                                    }
                                  } else {
                                    validate12.errors = [{ instancePath: instancePath + "/allowedNativeProfiles/" + i4, schemaPath: "#/definitions/OpaqueId/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                    return false;
                                  }
                                }
                                var valid11 = _errs26 === errors;
                                if (!valid11) {
                                  break;
                                }
                              }
                              if (valid11) {
                                let i5 = data8.length;
                                let j2;
                                if (i5 > 1) {
                                  outer2: for (; i5--; ) {
                                    for (j2 = i5; j2--; ) {
                                      if (func0(data8[i5], data8[j2])) {
                                        validate12.errors = [{ instancePath: instancePath + "/allowedNativeProfiles", schemaPath: "#/properties/allowedNativeProfiles/uniqueItems", keyword: "uniqueItems", params: { i: i5, j: j2 }, message: "must NOT have duplicate items (items ## " + j2 + " and " + i5 + " are identical)" }];
                                        return false;
                                        break outer2;
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          } else {
                            validate12.errors = [{ instancePath: instancePath + "/allowedNativeProfiles", schemaPath: "#/properties/allowedNativeProfiles/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                            return false;
                          }
                        }
                        var valid0 = _errs24 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.projectBindingVersions !== void 0) {
                          let data10 = data.projectBindingVersions;
                          const _errs29 = errors;
                          if (errors === _errs29) {
                            if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
                              if (Object.keys(data10).length > 100) {
                                validate12.errors = [{ instancePath: instancePath + "/projectBindingVersions", schemaPath: "#/properties/projectBindingVersions/maxProperties", keyword: "maxProperties", params: { limit: 100 }, message: "must NOT have more than 100 properties" }];
                                return false;
                              } else {
                                if (Object.keys(data10).length < 1) {
                                  validate12.errors = [{ instancePath: instancePath + "/projectBindingVersions", schemaPath: "#/properties/projectBindingVersions/minProperties", keyword: "minProperties", params: { limit: 1 }, message: "must NOT have fewer than 1 properties" }];
                                  return false;
                                } else {
                                  for (const key1 in data10) {
                                    const _errs31 = errors;
                                    const _errs32 = errors;
                                    if (errors === _errs32) {
                                      if (typeof key1 === "string") {
                                        if (func3(key1) > 128) {
                                          const err0 = { instancePath: instancePath + "/projectBindingVersions", schemaPath: "#/definitions/OpaqueId/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters", propertyName: key1 };
                                          if (vErrors === null) {
                                            vErrors = [err0];
                                          } else {
                                            vErrors.push(err0);
                                          }
                                          errors++;
                                        } else {
                                          if (func3(key1) < 1) {
                                            const err1 = { instancePath: instancePath + "/projectBindingVersions", schemaPath: "#/definitions/OpaqueId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters", propertyName: key1 };
                                            if (vErrors === null) {
                                              vErrors = [err1];
                                            } else {
                                              vErrors.push(err1);
                                            }
                                            errors++;
                                          } else {
                                            if (!pattern0.test(key1)) {
                                              const err2 = { instancePath: instancePath + "/projectBindingVersions", schemaPath: "#/definitions/OpaqueId/pattern", keyword: "pattern", params: { pattern: "^[a-zA-Z0-9_-]+$" }, message: 'must match pattern "^[a-zA-Z0-9_-]+$"', propertyName: key1 };
                                              if (vErrors === null) {
                                                vErrors = [err2];
                                              } else {
                                                vErrors.push(err2);
                                              }
                                              errors++;
                                            }
                                          }
                                        }
                                      } else {
                                        const err3 = { instancePath: instancePath + "/projectBindingVersions", schemaPath: "#/definitions/OpaqueId/type", keyword: "type", params: { type: "string" }, message: "must be string", propertyName: key1 };
                                        if (vErrors === null) {
                                          vErrors = [err3];
                                        } else {
                                          vErrors.push(err3);
                                        }
                                        errors++;
                                      }
                                    }
                                    var valid14 = _errs31 === errors;
                                    if (!valid14) {
                                      const err4 = { instancePath: instancePath + "/projectBindingVersions", schemaPath: "#/properties/projectBindingVersions/propertyNames", keyword: "propertyNames", params: { propertyName: key1 }, message: "property name must be valid" };
                                      if (vErrors === null) {
                                        vErrors = [err4];
                                      } else {
                                        vErrors.push(err4);
                                      }
                                      errors++;
                                      validate12.errors = vErrors;
                                      return false;
                                      break;
                                    }
                                  }
                                  if (valid14) {
                                    for (const key2 in data10) {
                                      let data11 = data10[key2];
                                      const _errs35 = errors;
                                      const _errs36 = errors;
                                      if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
                                        validate12.errors = [{ instancePath: instancePath + "/projectBindingVersions/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/Version/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                        return false;
                                      }
                                      if (errors === _errs36) {
                                        if (typeof data11 == "number" && isFinite(data11)) {
                                          if (data11 > 9007199254740991 || isNaN(data11)) {
                                            validate12.errors = [{ instancePath: instancePath + "/projectBindingVersions/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/Version/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" }];
                                            return false;
                                          } else {
                                            if (data11 < 1 || isNaN(data11)) {
                                              validate12.errors = [{ instancePath: instancePath + "/projectBindingVersions/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/Version/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                              return false;
                                            }
                                          }
                                        }
                                      }
                                      var valid16 = _errs35 === errors;
                                      if (!valid16) {
                                        break;
                                      }
                                    }
                                  }
                                }
                              }
                            } else {
                              validate12.errors = [{ instancePath: instancePath + "/projectBindingVersions", schemaPath: "#/properties/projectBindingVersions/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                              return false;
                            }
                          }
                          var valid0 = _errs29 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.nativeCatalogDigest !== void 0) {
                            let data12 = data.nativeCatalogDigest;
                            const _errs38 = errors;
                            if (typeof data12 !== "string" && data12 !== null) {
                              validate12.errors = [{ instancePath: instancePath + "/nativeCatalogDigest", schemaPath: "#/properties/nativeCatalogDigest/type", keyword: "type", params: { type: schema13.properties.nativeCatalogDigest.type }, message: "must be string,null" }];
                              return false;
                            }
                            if (errors === _errs38) {
                              if (typeof data12 === "string") {
                                if (!pattern3.test(data12)) {
                                  validate12.errors = [{ instancePath: instancePath + "/nativeCatalogDigest", schemaPath: "#/properties/nativeCatalogDigest/pattern", keyword: "pattern", params: { pattern: "^[a-f0-9]{64}$" }, message: 'must match pattern "^[a-f0-9]{64}$"' }];
                                  return false;
                                }
                              }
                            }
                            var valid0 = _errs38 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.policyVersion !== void 0) {
                              let data13 = data.policyVersion;
                              const _errs40 = errors;
                              const _errs41 = errors;
                              if (!(typeof data13 == "number" && (!(data13 % 1) && !isNaN(data13)) && isFinite(data13))) {
                                validate12.errors = [{ instancePath: instancePath + "/policyVersion", schemaPath: "#/definitions/Version/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                return false;
                              }
                              if (errors === _errs41) {
                                if (typeof data13 == "number" && isFinite(data13)) {
                                  if (data13 > 9007199254740991 || isNaN(data13)) {
                                    validate12.errors = [{ instancePath: instancePath + "/policyVersion", schemaPath: "#/definitions/Version/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" }];
                                    return false;
                                  } else {
                                    if (data13 < 1 || isNaN(data13)) {
                                      validate12.errors = [{ instancePath: instancePath + "/policyVersion", schemaPath: "#/definitions/Version/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                      return false;
                                    }
                                  }
                                }
                              }
                              var valid0 = _errs40 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.grantVersion !== void 0) {
                                let data14 = data.grantVersion;
                                const _errs43 = errors;
                                const _errs44 = errors;
                                if (!(typeof data14 == "number" && (!(data14 % 1) && !isNaN(data14)) && isFinite(data14))) {
                                  validate12.errors = [{ instancePath: instancePath + "/grantVersion", schemaPath: "#/definitions/Version/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                  return false;
                                }
                                if (errors === _errs44) {
                                  if (typeof data14 == "number" && isFinite(data14)) {
                                    if (data14 > 9007199254740991 || isNaN(data14)) {
                                      validate12.errors = [{ instancePath: instancePath + "/grantVersion", schemaPath: "#/definitions/Version/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" }];
                                      return false;
                                    } else {
                                      if (data14 < 1 || isNaN(data14)) {
                                        validate12.errors = [{ instancePath: instancePath + "/grantVersion", schemaPath: "#/definitions/Version/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                        return false;
                                      }
                                    }
                                  }
                                }
                                var valid0 = _errs43 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data.expiresAt !== void 0) {
                                  let data15 = data.expiresAt;
                                  const _errs46 = errors;
                                  if (errors === _errs46) {
                                    if (errors === _errs46) {
                                      if (typeof data15 === "string") {
                                        if (!formats8.validate(data15)) {
                                          validate12.errors = [{ instancePath: instancePath + "/expiresAt", schemaPath: "#/properties/expiresAt/format", keyword: "format", params: { format: "date-time" }, message: 'must match format "date-time"' }];
                                          return false;
                                        }
                                      } else {
                                        validate12.errors = [{ instancePath: instancePath + "/expiresAt", schemaPath: "#/properties/expiresAt/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                        return false;
                                      }
                                    }
                                  }
                                  var valid0 = _errs46 === errors;
                                } else {
                                  var valid0 = true;
                                }
                                if (valid0) {
                                  if (data.hostKeyFingerprint !== void 0) {
                                    let data16 = data.hostKeyFingerprint;
                                    const _errs48 = errors;
                                    const _errs49 = errors;
                                    if (errors === _errs49) {
                                      if (typeof data16 === "string") {
                                        if (!pattern3.test(data16)) {
                                          validate12.errors = [{ instancePath: instancePath + "/hostKeyFingerprint", schemaPath: "#/definitions/Fingerprint/pattern", keyword: "pattern", params: { pattern: "^[a-f0-9]{64}$" }, message: 'must match pattern "^[a-f0-9]{64}$"' }];
                                          return false;
                                        }
                                      } else {
                                        validate12.errors = [{ instancePath: instancePath + "/hostKeyFingerprint", schemaPath: "#/definitions/Fingerprint/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                        return false;
                                      }
                                    }
                                    var valid0 = _errs48 === errors;
                                  } else {
                                    var valid0 = true;
                                  }
                                  if (valid0) {
                                    if (data.controllerKeyFingerprint !== void 0) {
                                      let data17 = data.controllerKeyFingerprint;
                                      const _errs51 = errors;
                                      const _errs52 = errors;
                                      if (errors === _errs52) {
                                        if (typeof data17 === "string") {
                                          if (!pattern3.test(data17)) {
                                            validate12.errors = [{ instancePath: instancePath + "/controllerKeyFingerprint", schemaPath: "#/definitions/Fingerprint/pattern", keyword: "pattern", params: { pattern: "^[a-f0-9]{64}$" }, message: 'must match pattern "^[a-f0-9]{64}$"' }];
                                            return false;
                                          }
                                        } else {
                                          validate12.errors = [{ instancePath: instancePath + "/controllerKeyFingerprint", schemaPath: "#/definitions/Fingerprint/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                          return false;
                                        }
                                      }
                                      var valid0 = _errs51 === errors;
                                    } else {
                                      var valid0 = true;
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate12.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate12.errors = vErrors;
  return errors === 0;
}
function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate12(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
    errors = vErrors.length;
  }
  validate10.errors = vErrors;
  return errors === 0;
}
var CommandEnvelope = validate14;
var schema28 = { "type": "object", "additionalProperties": false, "required": ["version", "commandId", "grantId", "grantVersion", "policyVersion", "hostId", "controllerId", "projectId", "operation", "deadline", "payloadHash"], "properties": { "version": { "const": 1 }, "commandId": { "$ref": "#/definitions/UUID" }, "grantId": { "$ref": "#/definitions/UUID" }, "grantVersion": { "$ref": "#/definitions/Version" }, "policyVersion": { "$ref": "#/definitions/Version" }, "hostId": { "$ref": "#/definitions/UUID" }, "controllerId": { "$ref": "#/definitions/UUID" }, "projectId": { "$ref": "#/definitions/OpaqueId" }, "operation": { "$ref": "#/definitions/RemoteOperation" }, "deadline": { "type": "string", "format": "date-time" }, "payloadHash": { "$ref": "#/definitions/Fingerprint" } } };
function validate15(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.version === void 0 && (missing0 = "version") || data.commandId === void 0 && (missing0 = "commandId") || data.grantId === void 0 && (missing0 = "grantId") || data.grantVersion === void 0 && (missing0 = "grantVersion") || data.policyVersion === void 0 && (missing0 = "policyVersion") || data.hostId === void 0 && (missing0 = "hostId") || data.controllerId === void 0 && (missing0 = "controllerId") || data.projectId === void 0 && (missing0 = "projectId") || data.operation === void 0 && (missing0 = "operation") || data.deadline === void 0 && (missing0 = "deadline") || data.payloadHash === void 0 && (missing0 = "payloadHash")) {
        validate15.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" }];
        return false;
      } else {
        const _errs1 = errors;
        for (const key0 in data) {
          if (!func2.call(schema28.properties, key0)) {
            validate15.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" }];
            return false;
            break;
          }
        }
        if (_errs1 === errors) {
          if (data.version !== void 0) {
            const _errs2 = errors;
            if (1 !== data.version) {
              validate15.errors = [{ instancePath: instancePath + "/version", schemaPath: "#/properties/version/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" }];
              return false;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.commandId !== void 0) {
              let data1 = data.commandId;
              const _errs3 = errors;
              const _errs4 = errors;
              if (errors === _errs4) {
                if (errors === _errs4) {
                  if (typeof data1 === "string") {
                    if (!formats0.test(data1)) {
                      validate15.errors = [{ instancePath: instancePath + "/commandId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                      return false;
                    }
                  } else {
                    validate15.errors = [{ instancePath: instancePath + "/commandId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                    return false;
                  }
                }
              }
              var valid0 = _errs3 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.grantId !== void 0) {
                let data2 = data.grantId;
                const _errs6 = errors;
                const _errs7 = errors;
                if (errors === _errs7) {
                  if (errors === _errs7) {
                    if (typeof data2 === "string") {
                      if (!formats0.test(data2)) {
                        validate15.errors = [{ instancePath: instancePath + "/grantId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                        return false;
                      }
                    } else {
                      validate15.errors = [{ instancePath: instancePath + "/grantId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                      return false;
                    }
                  }
                }
                var valid0 = _errs6 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.grantVersion !== void 0) {
                  let data3 = data.grantVersion;
                  const _errs9 = errors;
                  const _errs10 = errors;
                  if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
                    validate15.errors = [{ instancePath: instancePath + "/grantVersion", schemaPath: "#/definitions/Version/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                    return false;
                  }
                  if (errors === _errs10) {
                    if (typeof data3 == "number" && isFinite(data3)) {
                      if (data3 > 9007199254740991 || isNaN(data3)) {
                        validate15.errors = [{ instancePath: instancePath + "/grantVersion", schemaPath: "#/definitions/Version/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" }];
                        return false;
                      } else {
                        if (data3 < 1 || isNaN(data3)) {
                          validate15.errors = [{ instancePath: instancePath + "/grantVersion", schemaPath: "#/definitions/Version/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                          return false;
                        }
                      }
                    }
                  }
                  var valid0 = _errs9 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.policyVersion !== void 0) {
                    let data4 = data.policyVersion;
                    const _errs12 = errors;
                    const _errs13 = errors;
                    if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
                      validate15.errors = [{ instancePath: instancePath + "/policyVersion", schemaPath: "#/definitions/Version/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                      return false;
                    }
                    if (errors === _errs13) {
                      if (typeof data4 == "number" && isFinite(data4)) {
                        if (data4 > 9007199254740991 || isNaN(data4)) {
                          validate15.errors = [{ instancePath: instancePath + "/policyVersion", schemaPath: "#/definitions/Version/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" }];
                          return false;
                        } else {
                          if (data4 < 1 || isNaN(data4)) {
                            validate15.errors = [{ instancePath: instancePath + "/policyVersion", schemaPath: "#/definitions/Version/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                            return false;
                          }
                        }
                      }
                    }
                    var valid0 = _errs12 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.hostId !== void 0) {
                      let data5 = data.hostId;
                      const _errs15 = errors;
                      const _errs16 = errors;
                      if (errors === _errs16) {
                        if (errors === _errs16) {
                          if (typeof data5 === "string") {
                            if (!formats0.test(data5)) {
                              validate15.errors = [{ instancePath: instancePath + "/hostId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                              return false;
                            }
                          } else {
                            validate15.errors = [{ instancePath: instancePath + "/hostId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                            return false;
                          }
                        }
                      }
                      var valid0 = _errs15 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.controllerId !== void 0) {
                        let data6 = data.controllerId;
                        const _errs18 = errors;
                        const _errs19 = errors;
                        if (errors === _errs19) {
                          if (errors === _errs19) {
                            if (typeof data6 === "string") {
                              if (!formats0.test(data6)) {
                                validate15.errors = [{ instancePath: instancePath + "/controllerId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                                return false;
                              }
                            } else {
                              validate15.errors = [{ instancePath: instancePath + "/controllerId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                              return false;
                            }
                          }
                        }
                        var valid0 = _errs18 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.projectId !== void 0) {
                          let data7 = data.projectId;
                          const _errs21 = errors;
                          const _errs22 = errors;
                          if (errors === _errs22) {
                            if (typeof data7 === "string") {
                              if (func3(data7) > 128) {
                                validate15.errors = [{ instancePath: instancePath + "/projectId", schemaPath: "#/definitions/OpaqueId/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" }];
                                return false;
                              } else {
                                if (func3(data7) < 1) {
                                  validate15.errors = [{ instancePath: instancePath + "/projectId", schemaPath: "#/definitions/OpaqueId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" }];
                                  return false;
                                } else {
                                  if (!pattern0.test(data7)) {
                                    validate15.errors = [{ instancePath: instancePath + "/projectId", schemaPath: "#/definitions/OpaqueId/pattern", keyword: "pattern", params: { pattern: "^[a-zA-Z0-9_-]+$" }, message: 'must match pattern "^[a-zA-Z0-9_-]+$"' }];
                                    return false;
                                  }
                                }
                              }
                            } else {
                              validate15.errors = [{ instancePath: instancePath + "/projectId", schemaPath: "#/definitions/OpaqueId/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                              return false;
                            }
                          }
                          var valid0 = _errs21 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.operation !== void 0) {
                            let data8 = data.operation;
                            const _errs24 = errors;
                            if (typeof data8 !== "string") {
                              validate15.errors = [{ instancePath: instancePath + "/operation", schemaPath: "#/definitions/RemoteOperation/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                              return false;
                            }
                            if (!(data8 === "project.list" || data8 === "conversation.read" || data8 === "run.start" || data8 === "run.stop" || data8 === "run.approve")) {
                              validate15.errors = [{ instancePath: instancePath + "/operation", schemaPath: "#/definitions/RemoteOperation/enum", keyword: "enum", params: { allowedValues: schema19.enum }, message: "must be equal to one of the allowed values" }];
                              return false;
                            }
                            var valid0 = _errs24 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.deadline !== void 0) {
                              let data9 = data.deadline;
                              const _errs27 = errors;
                              if (errors === _errs27) {
                                if (errors === _errs27) {
                                  if (typeof data9 === "string") {
                                    if (!formats8.validate(data9)) {
                                      validate15.errors = [{ instancePath: instancePath + "/deadline", schemaPath: "#/properties/deadline/format", keyword: "format", params: { format: "date-time" }, message: 'must match format "date-time"' }];
                                      return false;
                                    }
                                  } else {
                                    validate15.errors = [{ instancePath: instancePath + "/deadline", schemaPath: "#/properties/deadline/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                    return false;
                                  }
                                }
                              }
                              var valid0 = _errs27 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.payloadHash !== void 0) {
                                let data10 = data.payloadHash;
                                const _errs29 = errors;
                                const _errs30 = errors;
                                if (errors === _errs30) {
                                  if (typeof data10 === "string") {
                                    if (!pattern3.test(data10)) {
                                      validate15.errors = [{ instancePath: instancePath + "/payloadHash", schemaPath: "#/definitions/Fingerprint/pattern", keyword: "pattern", params: { pattern: "^[a-f0-9]{64}$" }, message: 'must match pattern "^[a-f0-9]{64}$"' }];
                                      return false;
                                    }
                                  } else {
                                    validate15.errors = [{ instancePath: instancePath + "/payloadHash", schemaPath: "#/definitions/Fingerprint/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                    return false;
                                  }
                                }
                                var valid0 = _errs29 === errors;
                              } else {
                                var valid0 = true;
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate15.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate15.errors = vErrors;
  return errors === 0;
}
function validate14(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate15(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
    errors = vErrors.length;
  }
  validate14.errors = vErrors;
  return errors === 0;
}
var AuthorizationLease = validate17;
var schema39 = { "type": "object", "additionalProperties": false, "required": ["leaseId", "commandId", "grantId", "hostId", "controllerId", "ownerUserId", "projectId", "operation", "deadline", "policyVersion", "grantVersion", "ttlMs", "issuedAt"], "properties": { "leaseId": { "$ref": "#/definitions/UUID" }, "commandId": { "$ref": "#/definitions/UUID" }, "grantId": { "$ref": "#/definitions/UUID" }, "hostId": { "$ref": "#/definitions/UUID" }, "controllerId": { "$ref": "#/definitions/UUID" }, "ownerUserId": { "$ref": "#/definitions/UUID" }, "projectId": { "$ref": "#/definitions/OpaqueId" }, "operation": { "$ref": "#/definitions/RemoteOperation" }, "deadline": { "type": "string", "format": "date-time" }, "policyVersion": { "$ref": "#/definitions/Version" }, "grantVersion": { "$ref": "#/definitions/Version" }, "ttlMs": { "const": 15e3 }, "issuedAt": { "type": "string", "format": "date-time" } } };
function validate18(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.leaseId === void 0 && (missing0 = "leaseId") || data.commandId === void 0 && (missing0 = "commandId") || data.grantId === void 0 && (missing0 = "grantId") || data.hostId === void 0 && (missing0 = "hostId") || data.controllerId === void 0 && (missing0 = "controllerId") || data.ownerUserId === void 0 && (missing0 = "ownerUserId") || data.projectId === void 0 && (missing0 = "projectId") || data.operation === void 0 && (missing0 = "operation") || data.deadline === void 0 && (missing0 = "deadline") || data.policyVersion === void 0 && (missing0 = "policyVersion") || data.grantVersion === void 0 && (missing0 = "grantVersion") || data.ttlMs === void 0 && (missing0 = "ttlMs") || data.issuedAt === void 0 && (missing0 = "issuedAt")) {
        validate18.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" }];
        return false;
      } else {
        const _errs1 = errors;
        for (const key0 in data) {
          if (!func2.call(schema39.properties, key0)) {
            validate18.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" }];
            return false;
            break;
          }
        }
        if (_errs1 === errors) {
          if (data.leaseId !== void 0) {
            let data0 = data.leaseId;
            const _errs2 = errors;
            const _errs3 = errors;
            if (errors === _errs3) {
              if (errors === _errs3) {
                if (typeof data0 === "string") {
                  if (!formats0.test(data0)) {
                    validate18.errors = [{ instancePath: instancePath + "/leaseId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                    return false;
                  }
                } else {
                  validate18.errors = [{ instancePath: instancePath + "/leaseId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                  return false;
                }
              }
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.commandId !== void 0) {
              let data1 = data.commandId;
              const _errs5 = errors;
              const _errs6 = errors;
              if (errors === _errs6) {
                if (errors === _errs6) {
                  if (typeof data1 === "string") {
                    if (!formats0.test(data1)) {
                      validate18.errors = [{ instancePath: instancePath + "/commandId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                      return false;
                    }
                  } else {
                    validate18.errors = [{ instancePath: instancePath + "/commandId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                    return false;
                  }
                }
              }
              var valid0 = _errs5 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.grantId !== void 0) {
                let data2 = data.grantId;
                const _errs8 = errors;
                const _errs9 = errors;
                if (errors === _errs9) {
                  if (errors === _errs9) {
                    if (typeof data2 === "string") {
                      if (!formats0.test(data2)) {
                        validate18.errors = [{ instancePath: instancePath + "/grantId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                        return false;
                      }
                    } else {
                      validate18.errors = [{ instancePath: instancePath + "/grantId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                      return false;
                    }
                  }
                }
                var valid0 = _errs8 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.hostId !== void 0) {
                  let data3 = data.hostId;
                  const _errs11 = errors;
                  const _errs12 = errors;
                  if (errors === _errs12) {
                    if (errors === _errs12) {
                      if (typeof data3 === "string") {
                        if (!formats0.test(data3)) {
                          validate18.errors = [{ instancePath: instancePath + "/hostId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                          return false;
                        }
                      } else {
                        validate18.errors = [{ instancePath: instancePath + "/hostId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                        return false;
                      }
                    }
                  }
                  var valid0 = _errs11 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.controllerId !== void 0) {
                    let data4 = data.controllerId;
                    const _errs14 = errors;
                    const _errs15 = errors;
                    if (errors === _errs15) {
                      if (errors === _errs15) {
                        if (typeof data4 === "string") {
                          if (!formats0.test(data4)) {
                            validate18.errors = [{ instancePath: instancePath + "/controllerId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                            return false;
                          }
                        } else {
                          validate18.errors = [{ instancePath: instancePath + "/controllerId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                          return false;
                        }
                      }
                    }
                    var valid0 = _errs14 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.ownerUserId !== void 0) {
                      let data5 = data.ownerUserId;
                      const _errs17 = errors;
                      const _errs18 = errors;
                      if (errors === _errs18) {
                        if (errors === _errs18) {
                          if (typeof data5 === "string") {
                            if (!formats0.test(data5)) {
                              validate18.errors = [{ instancePath: instancePath + "/ownerUserId", schemaPath: "#/definitions/UUID/format", keyword: "format", params: { format: "uuid" }, message: 'must match format "uuid"' }];
                              return false;
                            }
                          } else {
                            validate18.errors = [{ instancePath: instancePath + "/ownerUserId", schemaPath: "#/definitions/UUID/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                            return false;
                          }
                        }
                      }
                      var valid0 = _errs17 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.projectId !== void 0) {
                        let data6 = data.projectId;
                        const _errs20 = errors;
                        const _errs21 = errors;
                        if (errors === _errs21) {
                          if (typeof data6 === "string") {
                            if (func3(data6) > 128) {
                              validate18.errors = [{ instancePath: instancePath + "/projectId", schemaPath: "#/definitions/OpaqueId/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" }];
                              return false;
                            } else {
                              if (func3(data6) < 1) {
                                validate18.errors = [{ instancePath: instancePath + "/projectId", schemaPath: "#/definitions/OpaqueId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" }];
                                return false;
                              } else {
                                if (!pattern0.test(data6)) {
                                  validate18.errors = [{ instancePath: instancePath + "/projectId", schemaPath: "#/definitions/OpaqueId/pattern", keyword: "pattern", params: { pattern: "^[a-zA-Z0-9_-]+$" }, message: 'must match pattern "^[a-zA-Z0-9_-]+$"' }];
                                  return false;
                                }
                              }
                            }
                          } else {
                            validate18.errors = [{ instancePath: instancePath + "/projectId", schemaPath: "#/definitions/OpaqueId/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                            return false;
                          }
                        }
                        var valid0 = _errs20 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.operation !== void 0) {
                          let data7 = data.operation;
                          const _errs23 = errors;
                          if (typeof data7 !== "string") {
                            validate18.errors = [{ instancePath: instancePath + "/operation", schemaPath: "#/definitions/RemoteOperation/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                            return false;
                          }
                          if (!(data7 === "project.list" || data7 === "conversation.read" || data7 === "run.start" || data7 === "run.stop" || data7 === "run.approve")) {
                            validate18.errors = [{ instancePath: instancePath + "/operation", schemaPath: "#/definitions/RemoteOperation/enum", keyword: "enum", params: { allowedValues: schema19.enum }, message: "must be equal to one of the allowed values" }];
                            return false;
                          }
                          var valid0 = _errs23 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data.deadline !== void 0) {
                            let data8 = data.deadline;
                            const _errs26 = errors;
                            if (errors === _errs26) {
                              if (errors === _errs26) {
                                if (typeof data8 === "string") {
                                  if (!formats8.validate(data8)) {
                                    validate18.errors = [{ instancePath: instancePath + "/deadline", schemaPath: "#/properties/deadline/format", keyword: "format", params: { format: "date-time" }, message: 'must match format "date-time"' }];
                                    return false;
                                  }
                                } else {
                                  validate18.errors = [{ instancePath: instancePath + "/deadline", schemaPath: "#/properties/deadline/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                  return false;
                                }
                              }
                            }
                            var valid0 = _errs26 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.policyVersion !== void 0) {
                              let data9 = data.policyVersion;
                              const _errs28 = errors;
                              const _errs29 = errors;
                              if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
                                validate18.errors = [{ instancePath: instancePath + "/policyVersion", schemaPath: "#/definitions/Version/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                return false;
                              }
                              if (errors === _errs29) {
                                if (typeof data9 == "number" && isFinite(data9)) {
                                  if (data9 > 9007199254740991 || isNaN(data9)) {
                                    validate18.errors = [{ instancePath: instancePath + "/policyVersion", schemaPath: "#/definitions/Version/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" }];
                                    return false;
                                  } else {
                                    if (data9 < 1 || isNaN(data9)) {
                                      validate18.errors = [{ instancePath: instancePath + "/policyVersion", schemaPath: "#/definitions/Version/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                      return false;
                                    }
                                  }
                                }
                              }
                              var valid0 = _errs28 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data.grantVersion !== void 0) {
                                let data10 = data.grantVersion;
                                const _errs31 = errors;
                                const _errs32 = errors;
                                if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
                                  validate18.errors = [{ instancePath: instancePath + "/grantVersion", schemaPath: "#/definitions/Version/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                                  return false;
                                }
                                if (errors === _errs32) {
                                  if (typeof data10 == "number" && isFinite(data10)) {
                                    if (data10 > 9007199254740991 || isNaN(data10)) {
                                      validate18.errors = [{ instancePath: instancePath + "/grantVersion", schemaPath: "#/definitions/Version/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" }];
                                      return false;
                                    } else {
                                      if (data10 < 1 || isNaN(data10)) {
                                        validate18.errors = [{ instancePath: instancePath + "/grantVersion", schemaPath: "#/definitions/Version/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                        return false;
                                      }
                                    }
                                  }
                                }
                                var valid0 = _errs31 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data.ttlMs !== void 0) {
                                  const _errs34 = errors;
                                  if (15e3 !== data.ttlMs) {
                                    validate18.errors = [{ instancePath: instancePath + "/ttlMs", schemaPath: "#/properties/ttlMs/const", keyword: "const", params: { allowedValue: 15e3 }, message: "must be equal to constant" }];
                                    return false;
                                  }
                                  var valid0 = _errs34 === errors;
                                } else {
                                  var valid0 = true;
                                }
                                if (valid0) {
                                  if (data.issuedAt !== void 0) {
                                    let data12 = data.issuedAt;
                                    const _errs35 = errors;
                                    if (errors === _errs35) {
                                      if (errors === _errs35) {
                                        if (typeof data12 === "string") {
                                          if (!formats8.validate(data12)) {
                                            validate18.errors = [{ instancePath: instancePath + "/issuedAt", schemaPath: "#/properties/issuedAt/format", keyword: "format", params: { format: "date-time" }, message: 'must match format "date-time"' }];
                                            return false;
                                          }
                                        } else {
                                          validate18.errors = [{ instancePath: instancePath + "/issuedAt", schemaPath: "#/properties/issuedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                          return false;
                                        }
                                      }
                                    }
                                    var valid0 = _errs35 === errors;
                                  } else {
                                    var valid0 = true;
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate18.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate18.errors = vErrors;
  return errors === 0;
}
function validate17(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (!validate18(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate18.errors : vErrors.concat(validate18.errors);
    errors = vErrors.length;
  }
  validate17.errors = vErrors;
  return errors === 0;
}
var validators = { RemoteGrant, CommandEnvelope, AuthorizationLease };
function validateContract(name, value) {
  if (!validators[name]?.(value)) throw Error("invalid_contract");
  return structuredClone(value);
}

// ../users-remote-service-20261011/src/channel/packet.ts
function validateCiphertextPacket(value) {
  if (!value || Object.keys(value).sort().join(",") !== "ciphertext,enc,envelope,recipientFingerprint,senderFingerprint,sequence,sessionId,version" || value.version !== 1 || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || typeof value.sessionId !== "string" || value.sessionId.length < 1 || value.sessionId.length > 128 || typeof value.enc !== "string" || !/^[a-f0-9]{130}$/.test(value.enc) || typeof value.ciphertext !== "string" || value.ciphertext.length < 32 || value.ciphertext.length > 2097184 || !/^[a-f0-9]+$/.test(value.ciphertext) || value.ciphertext.length % 2)
    throw Error("invalid_packet");
  validateContract("CommandEnvelope", value.envelope);
  return structuredClone(value);
}

// ../users-remote-service-20261011/src/channel/sessionDescriptor.ts
var encoder = new TextEncoder();
function validateSessionDescriptor(input) {
  const fields = [
    "version",
    "channelSessionId",
    "serverInstanceId",
    "ownerUserId",
    "hostId",
    "controllerId",
    "grantId",
    "grantVersion",
    "policyVersion",
    "grantDigest",
    "hostKeyFingerprint",
    "controllerKeyFingerprint",
    "hostConnectionId",
    "controllerConnectionId",
    "generation",
    "createdAt",
    "expiresAt"
  ];
  if (!input || Object.keys(input).sort().join(",") !== fields.sort().join(",") || input.version !== 1)
    throw Error("invalid_channel_session");
  for (const name of [
    "channelSessionId",
    "serverInstanceId",
    "ownerUserId",
    "hostId",
    "controllerId",
    "grantId",
    "hostConnectionId",
    "controllerConnectionId"
  ])
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      input[name]
    ))
      throw Error("invalid_channel_session");
  for (const name of [
    "grantDigest",
    "hostKeyFingerprint",
    "controllerKeyFingerprint"
  ])
    if (!/^[a-f0-9]{64}$/.test(input[name]))
      throw Error("invalid_channel_session");
  if (![input.generation, input.grantVersion, input.policyVersion].every(
    (n) => Number.isSafeInteger(n) && n > 0
  ) || !Number.isFinite(Date.parse(input.createdAt)) || !Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.parse(input.createdAt))
    throw Error("invalid_channel_session");
  return structuredClone(input);
}
function sessionInfo(descriptor) {
  const s = validateSessionDescriptor(descriptor);
  return encoder.encode(
    JSON.stringify([
      "Codevalanche RFC9180 Auth16/1/2 bound session v1",
      s.version,
      s.channelSessionId,
      s.serverInstanceId,
      s.ownerUserId,
      s.hostId,
      s.controllerId,
      s.grantId,
      s.grantVersion,
      s.policyVersion,
      s.grantDigest,
      s.hostKeyFingerprint,
      s.controllerKeyFingerprint,
      s.hostConnectionId,
      s.controllerConnectionId,
      s.generation,
      s.createdAt,
      s.expiresAt
    ])
  );
}
function grantBindingBytes(g) {
  return encoder.encode(
    JSON.stringify([
      g.grantId,
      g.ownerUserId,
      g.hostId,
      g.controllerId,
      g.grantVersion,
      g.policyVersion,
      g.expiresAt,
      g.hostKeyFingerprint,
      g.controllerKeyFingerprint,
      [...g.projectIds].sort(),
      [...g.operations].sort(),
      [...g.allowedNativeProfiles].sort(),
      Object.keys(g.projectBindingVersions).sort().map((id) => [id, g.projectBindingVersions[id]]),
      g.nativeCatalogDigest
    ])
  );
}
function packetBindingBytes(p) {
  const e = p.envelope;
  return encoder.encode(
    JSON.stringify([
      p.version,
      p.sessionId,
      p.sequence,
      p.senderFingerprint,
      p.recipientFingerprint,
      e.version,
      e.commandId,
      e.grantId,
      e.grantVersion,
      e.policyVersion,
      e.hostId,
      e.controllerId,
      e.projectId,
      e.operation,
      e.deadline,
      e.payloadHash,
      p.enc,
      p.ciphertext
    ])
  );
}

// ../users-remote-service-20261011/src/channel/standardChannel.ts
var suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm()
});
var encoder2 = new TextEncoder();
function hex(bytes) {
  return Array.from(
    new Uint8Array(
      bytes instanceof Uint8Array ? bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) : bytes
    )
  ).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function unhex(s) {
  if (typeof s !== "string" || s.length % 2 || !/^[a-f0-9]+$/.test(s))
    throw new Error("authentication_failed");
  return Uint8Array.from(s.match(/../g), (h) => parseInt(h, 16));
}
async function fingerprintKey(key) {
  return hex(
    await crypto.subtle.digest(
      "SHA-256",
      await suite.kem.serializePublicKey(key)
    )
  );
}
async function createQualificationChannel(options) {
  options = {
    localIdentity: {
      publicKey: options.localIdentity.publicKey,
      privateKey: options.localIdentity.privateKey
    },
    pinnedPeer: {
      publicKey: options.pinnedPeer.publicKey,
      fingerprint: options.pinnedPeer.fingerprint
    },
    sessionId: options.sessionId,
    contextInfo: options.contextInfo ? new Uint8Array(options.contextInfo) : void 0
  };
  const peerFingerprint = await fingerprintKey(options.pinnedPeer.publicKey), localFingerprint = await fingerprintKey(options.localIdentity.publicKey);
  if (peerFingerprint !== options.pinnedPeer.fingerprint || !options.sessionId || options.sessionId.length > 128)
    throw new Error("peer_identity_mismatch");
  let sent = 0, received = 0, closed = false;
  let sendTail = Promise.resolve(), receiveTail = Promise.resolve();
  function serial(kind, fn) {
    const next = (kind === "send" ? sendTail : receiveTail).then(fn);
    if (kind === "send")
      sendTail = next.then(
        () => {
        },
        () => {
        }
      );
    else
      receiveTail = next.then(
        () => {
        },
        () => {
        }
      );
    return next;
  }
  const info = options.contextInfo ?? encoder2.encode("Codevalanche local HPKE qualification v1");
  function aad(p) {
    const e = p.envelope;
    return encoder2.encode(
      JSON.stringify([
        p.version,
        p.sessionId,
        p.sequence,
        p.senderFingerprint,
        p.recipientFingerprint,
        e.version,
        e.commandId,
        e.grantId,
        e.grantVersion,
        e.policyVersion,
        e.hostId,
        e.controllerId,
        e.projectId,
        e.operation,
        e.deadline,
        e.payloadHash
      ])
    );
  }
  return {
    seal(envelope, payload) {
      try {
        envelope = validateContract("CommandEnvelope", envelope);
        if (payload.byteLength > 1048576) throw Error("payload_too_large");
        payload = new Uint8Array(payload);
      } catch (error) {
        return Promise.reject(error);
      }
      return serial("send", async () => {
        if (closed) throw new Error("channel_closed");
        validateContract("CommandEnvelope", envelope);
        if (payload.byteLength > 1048576) throw new Error("payload_too_large");
        if (hex(
          await crypto.subtle.digest("SHA-256", new Uint8Array(payload))
        ) !== envelope.payloadHash)
          throw Error("payload_hash_mismatch");
        const metadata = {
          version: 1,
          sessionId: options.sessionId,
          sequence: sent + 1,
          senderFingerprint: localFingerprint,
          recipientFingerprint: peerFingerprint,
          envelope: structuredClone(envelope)
        };
        const context = await suite.createSenderContext({
          recipientPublicKey: options.pinnedPeer.publicKey,
          senderKey: options.localIdentity,
          info
        });
        const ciphertext = hex(await context.seal(payload, aad(metadata)));
        if (closed) throw Error("channel_closed");
        sent++;
        return { ...metadata, enc: hex(context.enc), ciphertext };
      });
    },
    open(packet) {
      try {
        packet = validateCiphertextPacket(packet);
      } catch (error) {
        return Promise.reject(error);
      }
      return serial("receive", async () => {
        if (closed) throw new Error("channel_closed");
        if (!packet || Object.keys(packet).sort().join(",") !== "ciphertext,enc,envelope,recipientFingerprint,senderFingerprint,sequence,sessionId,version" || typeof packet.ciphertext !== "string" || typeof packet.enc !== "string")
          throw Error("invalid_packet");
        validateContract("CommandEnvelope", packet.envelope);
        if (packet.version !== 1 || packet.sessionId !== options.sessionId || packet.senderFingerprint !== peerFingerprint || packet.recipientFingerprint !== localFingerprint)
          throw new Error("peer_identity_mismatch");
        if (packet.sequence !== received + 1)
          throw new Error("replay_or_out_of_order");
        if (packet.ciphertext.length > 2097184)
          throw new Error("payload_too_large");
        try {
          const context = await suite.createRecipientContext({
            recipientKey: options.localIdentity,
            senderPublicKey: options.pinnedPeer.publicKey,
            enc: unhex(packet.enc),
            info
          });
          const result = new Uint8Array(
            await context.open(unhex(packet.ciphertext), aad(packet))
          );
          if (hex(await crypto.subtle.digest("SHA-256", result)) !== packet.envelope.payloadHash)
            throw Error("payload_hash_mismatch");
          if (closed) throw Error("channel_closed");
          received++;
          return result;
        } catch {
          throw new Error("authentication_failed");
        }
      });
    },
    close() {
      closed = true;
    }
  };
}
async function createBoundQualificationChannel(options) {
  options = {
    ...options,
    localIdentity: {
      publicKey: options.localIdentity.publicKey,
      privateKey: options.localIdentity.privateKey
    },
    pinnedPeer: {
      publicKey: options.pinnedPeer.publicKey,
      fingerprint: options.pinnedPeer.fingerprint
    },
    session: structuredClone(options.session)
  };
  const session = Object.freeze(validateSessionDescriptor(options.session)), side = options.side, delivery = options.delivery;
  if (!["host", "controller"].includes(side))
    throw Error("invalid_channel_direction");
  const host = side === "host", localExpected = host ? session.hostKeyFingerprint : session.controllerKeyFingerprint, peerExpected = host ? session.controllerKeyFingerprint : session.hostKeyFingerprint;
  if (await fingerprintKey(options.localIdentity.publicKey) !== localExpected || options.pinnedPeer.fingerprint !== peerExpected)
    throw Error("peer_identity_mismatch");
  const primitive = await createQualificationChannel({
    localIdentity: options.localIdentity,
    pinnedPeer: options.pinnedPeer,
    sessionId: session.channelSessionId,
    contextInfo: sessionInfo(session)
  });
  let boundClosed = false;
  const scope = (e) => {
    if (boundClosed) throw Error("channel_closed");
    if (e.hostId !== session.hostId || e.controllerId !== session.controllerId || e.grantId !== session.grantId || e.grantVersion !== session.grantVersion || e.policyVersion !== session.policyVersion)
      throw Error("channel_grant_changed");
    if (Date.now() >= Date.parse(session.expiresAt))
      throw Error("channel_session_expired");
  };
  return {
    get session() {
      return Object.freeze(structuredClone(session));
    },
    seal(e, payload) {
      try {
        scope(e);
        return primitive.seal(e, payload);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    async open(input) {
      const packet = validateCiphertextPacket(input);
      scope(packet.envelope);
      const plaintext = await primitive.open(packet);
      scope(packet.envelope);
      if (!delivery) throw Error("channel_delivery_unavailable");
      await delivery.consume(packet, session, side);
      scope(packet.envelope);
      return plaintext;
    },
    close() {
      boundClosed = true;
      primitive.close();
      delivery?.close();
    }
  };
}

// ../users-remote-service-20261011/src/channel/deliveryClient.ts
var ChannelDeliveryClient = class {
  #transport;
  #pending = /* @__PURE__ */ new Map();
  #unsubscribe;
  #closed = false;
  #epoch = 0;
  constructor(transport) {
    this.#transport = { ...transport };
    this.#unsubscribe = transport.subscribe((data) => {
      let message;
      try {
        message = JSON.parse(data);
      } catch {
        return;
      }
      const pending = this.#pending.get(message.requestId);
      if (!pending) return;
      if (message.type === "error") {
        clearTimeout(pending.timer);
        this.#pending.delete(message.requestId);
        pending.reject(
          Error(message.error?.code ?? "channel_delivery_refused")
        );
      } else if (message.type === "channel.delivery") {
        clearTimeout(pending.timer);
        this.#pending.delete(message.requestId);
        pending.resolve(message);
      }
    });
  }
  async consume(packet, session, side) {
    const started = performance.now();
    if (!Number.isFinite(started) || started < 0)
      throw Error("invalid_monotonic_clock");
    const epoch = this.#epoch;
    let last = started;
    const current = () => {
      const now = performance.now();
      if (!Number.isFinite(now) || now < 0 || now < last || now < started)
        throw Error("invalid_monotonic_clock");
      last = now;
      if (this.#closed || this.#epoch !== epoch)
        throw Error("channel_connection_closed");
      if (now - started >= 15e3) throw Error("channel_delivery_timeout");
      return 15e3 - (now - started);
    };
    current();
    packet = validateCiphertextPacket(packet);
    session = validateSessionDescriptor(session);
    const direction = side === "host" ? "controller_to_host" : "host_to_controller", expectedConnection = side === "host" ? session.hostConnectionId : session.controllerConnectionId;
    if (this.#transport.connectionId !== expectedConnection)
      throw Error("channel_connection_mismatch");
    const bytes = new Uint8Array(
      await crypto.subtle.digest("SHA-256", packetBindingBytes(packet))
    ), packetDigest = Array.from(
      bytes,
      (b) => b.toString(16).padStart(2, "0")
    ).join(""), requestId = crypto.randomUUID();
    const remaining = current();
    const receipt = await new Promise(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          this.#pending.delete(requestId);
          reject(Error("channel_delivery_timeout"));
        }, remaining);
        try {
          current();
        } catch (error) {
          clearTimeout(timer);
          reject(error);
          return;
        }
        this.#pending.set(requestId, { resolve, reject, timer });
        try {
          current();
          this.#transport.send(
            JSON.stringify({
              type: "channel.consume",
              requestId,
              channelSessionId: session.channelSessionId,
              sequence: packet.sequence,
              direction,
              packetDigest
            })
          );
        } catch (error) {
          clearTimeout(timer);
          this.#pending.delete(requestId);
          reject(error);
        }
      }
    );
    current();
    if (receipt.accepted !== true || receipt.channelSessionId !== session.channelSessionId || receipt.sequence !== packet.sequence || receipt.direction !== direction || receipt.packetDigest !== packetDigest || receipt.recipientConnectionId !== expectedConnection || this.#closed)
      throw Error("invalid_channel_delivery_receipt");
  }
  close() {
    this.#closed = true;
    this.#epoch++;
    this.#unsubscribe();
    for (const p of this.#pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("channel_connection_closed"));
    }
    this.#pending.clear();
  }
};
export {
  ChannelDeliveryClient,
  createBoundQualificationChannel,
  grantBindingBytes,
  packetBindingBytes,
  validateContract,
  validateSessionDescriptor
};
/*! Bundled license information:

@hpke/common/esm/src/curve/modular.js:
@hpke/common/esm/src/curve/montgomery.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
