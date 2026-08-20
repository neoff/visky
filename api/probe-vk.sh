#!/usr/bin/env bash
# Probe VK token endpoint: which app_id+secret pairs are still alive and
# whether they demand 2FA/captcha. Uses DUMMY creds (no real login needed).
#
# Reading the output:
#   error=invalid_client / invalid_request  -> pair DEAD (client removed/blocked)
#   error mentions login/password/username  -> pair ALIVE (client OK, creds wrong = expected)
#   error=need_captcha                       -> pair ALIVE, wants captcha
#   error=need_validation                    -> pair ALIVE, wants 2FA
#
# Run:  bash api/probe-vk.sh
UA_VK="VKAndroidApp/7.7-9034 (Android 12; SDK 31; arm64-v8a; ru)"
UA_KATE="KateMobileAndroid/56 lite-460 (Android 4.4.2; SDK 19; x86; unknown Android SDK built for x86; en)"
DEV=$(head -c 8 /dev/urandom | xxd -p)

probe() {
  local id="$1" sec="$2" name="$3" ua="$4"
  echo "=========================================================="
  echo "=== $name (app_id=$id)"
  curl -s -G "https://oauth.vk.com/token" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=$id" \
    --data-urlencode "client_secret=$sec" \
    --data-urlencode "username=probe_$DEV@example.com" \
    --data-urlencode "password=xProbe123456!" \
    --data-urlencode "scope=nohttps,audio,offline" \
    --data-urlencode "2fa_supported=1" \
    --data-urlencode "v=5.131" \
    --data-urlencode "device_id=$DEV" \
    --data-urlencode "lang=en" \
    -H "User-Agent: $ua" \
    --max-time 20 -w "\n[http_code=%{http_code}]\n"
  echo
}

probe 2685278 lxhD8OD7dMsqtXIm5IUY "Kate Mobile" "$UA_KATE"
probe 2274003 hHbZxrka2uZ6jB1inYsH "VK Android" "$UA_VK"
probe 6121396 GAgOZuJE9nsp7Wae7WAf "VK Admin"   "$UA_VK"
