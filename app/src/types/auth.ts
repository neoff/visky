// To parse this data:
//
//   import { Convert, AuthFragments } from "./file";
//
//   const authFragments = Convert.toAuthFragments(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.


export interface AuthFragments {
    cookie?: Cookie;
    success?: string;
    access_token?: string;
    user_id: string | null;
    secret?: string;
    expires?: Date;
    maxAge?: number;
    created?: Date;
    device_id?: string;
}

export interface Cookie {
    path: string;
    _expires: Date;
    originalMaxAge: number;
    httpOnly: boolean;
}





// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toAuthFragments(json: string): AuthFragments {
        return cast(JSON.parse(json), r("AuthFragments"));
    }

    public static authFragmentsToJson(value: AuthFragments): string {
        return JSON.stringify(uncast(value, r("AuthFragments")), null, 2);
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ''): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = '', parent: any = ''): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) { }
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems") ? transformArray(typ.arrayItems, val)
                : typ.hasOwnProperty("props") ? transformObject(getProps(typ), typ.additional, val)
                    : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return { literal: typ };
}

function a(typ: any) {
    return { arrayItems: typ };
}

function u(...typs: any[]) {
    return { unionMembers: typs };
}

function o(props: any[], additional: any) {
    return { props, additional };
}

function m(additional: any) {
    return { props: [], additional };
}

function r(name: string) {
    return { ref: name };
}

const typeMap: any = {
    "AuthFragments": o([
        { json: "user", js: "user", typ: r("User") },
        { json: "refresh", js: "refresh", typ: r("Refresh") },
        { json: "data", js: "data", typ: r("Data") },
    ], false),
    "Data": o([
        { json: "cookie", js: "cookie", typ: r("Cookie") },
        { json: "success", js: "success", typ: "" },
        { json: "access_token", js: "access_token", typ: "" },
        { json: "user_id", js: "user_id", typ: "" },
        { json: "secret", js: "secret", typ: "" },
        { json: "expires", js: "expires", typ: Date },
        { json: "maxAge", js: "maxAge", typ: 0 },
        { json: "created", js: "created", typ: Date },
        { json: "device_id", js: "device_id", typ: "" },
    ], false),
    "Cookie": o([
        { json: "path", js: "path", typ: "" },
        { json: "_expires", js: "_expires", typ: Date },
        { json: "originalMaxAge", js: "originalMaxAge", typ: 0 },
        { json: "httpOnly", js: "httpOnly", typ: true },
    ], false),
    "Refresh": o([
        { json: "token", js: "token", typ: "" },
        { json: "secret", js: "secret", typ: "" },
        { json: "expires", js: "expires", typ: Date },
        { json: "maxAge", js: "maxAge", typ: 0 },
        { json: "created", js: "created", typ: Date },
    ], false),
    "User": o([
        { json: "profile", js: "profile", typ: r("Profile") },
        { json: "info", js: "info", typ: r("Info") },
        { json: "time", js: "time", typ: 0 },
        { json: "has_new_items", js: "has_new_items", typ: r("HasNewItems") },
        { json: "allow_buy_votes", js: "allow_buy_votes", typ: true },
        { json: "ads_stoplist", js: "ads_stoplist", typ: a("any") },
        { json: "use_vigo", js: "use_vigo", typ: true },
        { json: "html_games_supported", js: "html_games_supported", typ: 0 },
        { json: "defaultAudioPlayer", js: "defaultAudioPlayer", typ: "" },
    ], false),
    "HasNewItems": o([
        { json: "global_promotion", js: "global_promotion", typ: 0 },
        { json: "store_new_items", js: "store_new_items", typ: 0 },
        { json: "stickers_version_hash", js: "stickers_version_hash", typ: "" },
        { json: "favorite_stickers_version_hash", js: "favorite_stickers_version_hash", typ: "" },
    ], false),
    "Info": o([
        { json: "2fa_required", js: "2fa_required", typ: 0 },
        { json: "business_notify_enabled", js: "business_notify_enabled", typ: 0 },
        { json: "change_email_url", js: "change_email_url", typ: "" },
        { json: "change_phone_url", js: "change_phone_url", typ: "" },
        { json: "country", js: "country", typ: "" },
        { json: "debug_available", js: "debug_available", typ: true },
        { json: "email", js: "email", typ: "" },
        { json: "email_status", js: "email_status", typ: "" },
        { json: "eu_user", js: "eu_user", typ: true },
        { json: "https_required", js: "https_required", typ: 0 },
        { json: "intro", js: "intro", typ: 0 },
        { json: "music_intro", js: "music_intro", typ: 0 },
        { json: "fave_intro", js: "fave_intro", typ: 0 },
        { json: "menu_intro", js: "menu_intro", typ: true },
        { json: "community_comments", js: "community_comments", typ: true },
        { json: "track_installed_apps", js: "track_installed_apps", typ: true },
        { json: "reports_spa", js: "reports_spa", typ: true },
        { json: "lang", js: "lang", typ: 0 },
        { json: "no_wall_replies", js: "no_wall_replies", typ: 0 },
        { json: "own_posts_default", js: "own_posts_default", typ: 0 },
        { json: "phone", js: "phone", typ: "" },
        { json: "phone_status", js: "phone_status", typ: "" },
        { json: "profiler_enabled", js: "profiler_enabled", typ: true },
        { json: "raise_to_record_enabled", js: "raise_to_record_enabled", typ: true },
        { json: "support_url", js: "support_url", typ: "" },
        { json: "vk_pay_endpoint", js: "vk_pay_endpoint", typ: "" },
        { json: "vk_pay_endpoint_v2", js: "vk_pay_endpoint_v2", typ: "" },
        { json: "stream_special_comment_price", js: "stream_special_comment_price", typ: 0 },
        { json: "subscription_combo_allowed", js: "subscription_combo_allowed", typ: true },
        { json: "include_channel_notifications", js: "include_channel_notifications", typ: true },
        { json: "messages_transcript_auto_show", js: "messages_transcript_auto_show", typ: true },
        { json: "messages_multiline_input", js: "messages_multiline_input", typ: true },
        { json: "obscene_text_filter", js: "obscene_text_filter", typ: true },
        { json: "can_change_password", js: "can_change_password", typ: true },
        { json: "is_personal_ads_easy_promote_enabled", js: "is_personal_ads_easy_promote_enabled", typ: true },
    ], false),
    "Profile": o([
        { json: "id", js: "id", typ: 0 },
        { json: "first_name", js: "first_name", typ: "" },
        { json: "last_name", js: "last_name", typ: "" },
        { json: "can_access_closed", js: "can_access_closed", typ: true },
        { json: "is_closed", js: "is_closed", typ: true },
    ], false),
};
