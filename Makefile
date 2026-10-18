# visky — one entry point for every build, release and deploy.
#
# Everything here is a thin dispatcher over scripts/: the scripts keep the
# knowledge (signing, credentials, store APIs, the version rule), this file only
# spares you having to remember which of the eleven is the right one. Run
# `make help` for the list.
#
# HOW FLAGS WORK, because make makes this awkward. Anything after the target is
# a make GOAL, not an option, and make refuses a goal that starts with `--`
# unless a lone `--` ends its own option parsing first:
#
#   make desktop -- --dmg --install      # flags, the explicit way
#   make desktop dmg install             # the same, no dashes needed
#   make desktop EXTRA="--dmg --install" # the same, for scripts and CI
#
# Values that are not on/off switches are variables instead, because make cannot
# tell `--arch arm64` from two unrelated goals: ARCH, TRACK, BUILD, TAG, PROFILE.
#
# TWO RULES THIS FILE KEEPS, both learned the hard way:
#
#   * every target runs only when it is the FIRST goal on the line. The words
#     after it are goals too, and `make app desktop` would otherwise build the
#     desktop a second time.
#   * no recipe calls $(MAKE). make runs a recipe line containing $(MAKE) even
#     under `-n`, so a recursive dispatcher turns `make -n desktop` — the thing
#     you type to SEE what would happen — into a real signed build. The per
#     platform commands are make variables instead, expanded into one shell
#     line, which `-n` prints and does not run.

SHELL := /bin/bash
.DEFAULT_GOAL := help

ROOT := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
S    := $(ROOT)/scripts

# --- the command line ------------------------------------------------------
PRIMARY := $(if $(MAKECMDGOALS),$(firstword $(MAKECMDGOALS)),$(.DEFAULT_GOAL))
ARGS    := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
# `--dmg` and `dmg` are the same flag; EXTRA="..." adds more of either spelling
FLAGS   := $(patsubst --%,%,$(ARGS) $(EXTRA))
on       = $(strip $(filter $(1),$(FLAGS)))
# runs the rest of the recipe only for the first goal on the command line
guard    = test "$(PRIMARY)" = "$@" || exit 0

# --- values ----------------------------------------------------------------
ARCH      ?= $(if $(call on,universal),universal,$(if $(call on,x64),x64,arm64))
TRACK     ?= internal
API_IMAGE ?= varg/visky-api

.PHONY: help api deploy-api app ios android desktop web deploy-web install \
        version version-check test lint deps dev-api dev-app scripts

# ---------------------------------------------------------------------------
# the commands, one per destination
# ---------------------------------------------------------------------------
# EAS cloud builds the LAST COMMIT; --local builds the tree in front of you and
# talks to nobody but Apple. `--no-submit` means the same thing to both, even
# though the local script spells it --no-upload.
IOS_CMD = $(if $(call on,local),\
  "$(S)/deploy-ios-local.sh" \
    $(if $(or $(call on,no-submit),$(call on,no-upload)),--no-upload,) \
    $(if $(call on,no-prebuild),--no-prebuild,),\
  "$(S)/deploy-ios.sh" \
    $(if $(call on,no-submit),--no-submit,) \
    $(if $(call on,submit-last),--submit-last,))

# The same split for Android: build-app.sh is EAS (cloud, or --local through
# EAS), build-app-local.sh is gradlew plus the Play API, no expo.dev anywhere.
ANDROID_CMD = $(if $(call on,local),\
  "$(S)/build-app-local.sh" \
    $(if $(or $(call on,no-submit),$(call on,no-upload)),--no-upload,) \
    $(if $(call on,no-prebuild),--no-prebuild,) \
    --track $(TRACK),\
  "$(S)/build-app.sh" $(if $(call on,no-submit),--no-submit,))

# Three shells, one bundle: Tauri (what ships), the Mac App Store variant of it,
# and the Electron shell Tauri replaced.
DESKTOP_SHELL_CMD = $(if $(call on,electron),\
  "$(S)/build-desktop-electron.sh" \
    $(if $(call on,dmg),--dmg,) $(if $(call on,pkg),--pkg,) --arch $(ARCH) \
    $(if $(call on,skip-bundle),--skip-bundle,) \
    $(if $(call on,run),--run,) $(if $(call on,unsigned),--unsigned,),\
  $(if $(or $(call on,mas),$(call on,upload)),\
    "$(S)/build-desktop-mas.sh" --arch $(ARCH) \
      $(if $(call on,skip-bundle),--skip-bundle,) \
      $(if $(BUILD),--build $(BUILD),) \
      $(if $(call on,upload),--upload,),\
    "$(S)/build-desktop.sh" \
      $(if $(call on,dmg),--dmg,) $(if $(call on,pkg),--pkg,) --arch $(ARCH) \
      $(if $(call on,skip-bundle),--skip-bundle,) \
      $(if $(call on,run),--run,) $(if $(call on,unsigned),--unsigned,)))

# The newest .app any of the three desktop builds left behind, into
# /Applications. The quarantine flag is stripped because an unnotarised build
# carries one and Gatekeeper then refuses to open it at all.
INSTALL_CMD = src="$$(ls -dt "$(ROOT)"/desktop/dist/visky.app \
	  "$(ROOT)"/desktop/dist-mas/visky.app \
	  "$(ROOT)"/desktop-electron/dist/*/visky.app 2>/dev/null | head -1)"; \
	if [ -z "$$src" ]; then echo "!! no built visky.app — run make desktop first" >&2; exit 1; fi; \
	dest=/Applications/visky.app; \
	if [ -e "$$dest/Contents/_MASReceipt" ] || { [ -e "$$dest" ] && [ ! -w "$$dest" ]; }; then \
	  echo "   /Applications holds a Mac App Store copy (root-owned); it cannot be replaced from here"; \
	  mkdir -p "$$HOME/Applications"; dest="$$HOME/Applications/visky.app"; \
	fi; \
	echo "==> installing $$src -> $$dest"; \
	rm -rf "$$dest" || { echo "!! could not remove $$dest" >&2; exit 1; }; \
	ditto "$$src" "$$dest" || { echo "!! could not copy the build into $$dest" >&2; exit 1; }; \
	[ -x "$$dest/Contents/MacOS/visky" ] || { echo "!! $$dest is not a working bundle after the copy" >&2; exit 1; }; \
	xattr -dr com.apple.quarantine "$$dest" 2>/dev/null || true; \
	echo "==> installed $$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$$dest/Contents/Info.plist" 2>/dev/null) -> $$dest"; \
	echo "    open \"$$dest\""

DESKTOP_CMD = $(DESKTOP_SHELL_CMD)$(if $(call on,install), && { $(INSTALL_CMD); },)

WEB_CMD = "$(S)/build-web.sh" \
  $(if $(call on,skip-bundle),--skip-bundle,) \
  $(if $(call on,local),--local,) \
  $(if $(call on,serve),--serve,) \
  $(if $(call on,deploy),--deploy,)

# `make app ios` and `make ios` are the same thing; the sub-word form exists
# because that is how the four read as a set.
APP_CMD = $(if $(call on,ios),$(IOS_CMD),\
  $(if $(call on,android),$(ANDROID_CMD),\
  $(if $(call on,desktop),$(DESKTOP_CMD),\
  $(if $(call on,web),$(WEB_CMD),\
  echo "make app <desktop|web|ios|android>   (see: make help)" >&2; exit 1))))

# Default is the whole api release: bump the patch version, build, push, roll
# out. `redeploy` is the other half — the same version again, with the image
# built on the spot when Docker Hub has no such tag (a version bumped by a build
# that failed before the push, or one that only ever existed on this machine).
API_REDEPLOY_CMD = ver="$$(node -p "require('$(ROOT)/api/package.json').version")"; \
	echo "==> redeploy $(API_IMAGE):$$ver"; \
	if docker manifest inspect "$(API_IMAGE):$$ver" >/dev/null 2>&1; then \
	  echo "    that tag is on Docker Hub — rolling it out as it is"; \
	else \
	  echo "    no $(API_IMAGE):$$ver on Docker Hub — building it from this tree first"; \
	  "$(S)/build-api.sh" --no-bump; \
	fi; \
	"$(S)/deploy-api.sh" "$$ver"

API_BUILD_CMD = BUMP=$(if $(call on,bump-major),major,$(if $(call on,bump-minor),minor,patch)) \
	"$(S)/build-api.sh" \
	  $(if $(call on,no-bump),--no-bump,) \
	  $(if $(call on,no-deploy),,--deploy)

API_CMD = $(if $(call on,redeploy),$(API_REDEPLOY_CMD),$(API_BUILD_CMD))

# ---------------------------------------------------------------------------
# targets
# ---------------------------------------------------------------------------
api:
	@$(guard); $(API_CMD)

deploy-api:
	@$(guard); "$(S)/deploy-api.sh" $(TAG)

app:
	@$(guard); $(APP_CMD)

ios:
	@$(guard); $(IOS_CMD)

android:
	@$(guard); $(ANDROID_CMD)

desktop:
	@$(guard); $(DESKTOP_CMD)

web:
	@$(guard); $(WEB_CMD)

deploy-web:
	@$(guard); "$(S)/deploy-web.sh" $(TAG)

install:
	@$(guard); $(INSTALL_CMD)

# api/package.json is the single source of the version: every frontend carries
# the API's number, so a build records the backend contract it was made against.
version:
	@$(guard); "$(S)/sync-version.sh"

version-check:
	@$(guard); "$(S)/sync-version.sh" --check

test:
	@$(guard); cd "$(ROOT)/api" && npx jest --coverage && cd "$(ROOT)/app" && npx jest

lint:
	@$(guard); cd "$(ROOT)/api" && npx eslint . && cd "$(ROOT)/app" && npx eslint .

deps:
	@$(guard); cd "$(ROOT)/api" && npm install && cd "$(ROOT)/app" && npm install

dev-api:
	@$(guard); cd "$(ROOT)/api" && npx tsx watch src/index.ts

dev-app:
	@$(guard); cd "$(ROOT)/app" && npx expo start

scripts:
	@$(guard); sed -n '1,40p' "$(S)/README.md"; echo "...the rest: scripts/README.md"

# ---------------------------------------------------------------------------
# help
# ---------------------------------------------------------------------------
help:
	@$(guard); \
	echo "visky — make <target> [flags]    (flags: bare words, or after a lone --)"; \
	echo; \
	echo "  make api                      bump patch, build + push the image, deploy to k8s"; \
	echo "      -- --no-deploy            build + push only"; \
	echo "      -- --no-bump              reuse the version in api/package.json"; \
	echo "      -- --bump-minor|--bump-major"; \
	echo "      redeploy                  roll the CURRENT version out again; builds and"; \
	echo "                                pushes it first if that tag is not on Docker Hub"; \
	echo "  make deploy-api TAG=1.5.52    deploy one tag, nothing else"; \
	echo; \
	echo "  make app <desktop|web|ios|android> [flags]   — or the platform directly:"; \
	echo "  make ios                      EAS cloud build -> App Store Connect"; \
	echo "      -- --local                xcodebuild here -> App Store Connect (no EAS)"; \
	echo "      -- --no-submit            build only (local: keeps the .ipa)"; \
	echo "      -- --no-prebuild          reuse app/ios as it stands (--local only)"; \
	echo "      -- --submit-last          submit the last EAS build, no rebuild (cloud only)"; \
	echo "  make android                  EAS cloud build -> Google Play ($(TRACK))"; \
	echo "      -- --local                gradlew here -> Google Play (no EAS)"; \
	echo "      -- --no-submit            build only"; \
	echo "      -- --no-prebuild          reuse app/android (--local only)"; \
	echo "      TRACK=alpha               a different Play track (--local only)"; \
	echo; \
	echo "  make desktop                  signed .dmg + .pkg (Tauri, Developer ID)"; \
	echo "      -- --dmg | --pkg          one target instead of both"; \
	echo "      ARCH=arm64|universal|x64  default arm64"; \
	echo "      -- --skip-bundle          reuse desktop/web, rebuild the shell only"; \
	echo "      -- --run                  launch it locally, package nothing"; \
	echo "      -- --install              copy the built .app into /Applications"; \
	echo "      -- --unsigned             skip signing"; \
	echo "      -- --mas                  Mac App Store build instead (desktop/dist-mas)"; \
	echo "      -- --upload               ...and upload it to App Store Connect"; \
	echo "      -- --electron             the old Electron shell instead of Tauri"; \
	echo "  make install                  install the newest already-built .app"; \
	echo; \
	echo "  make web                      export the player, build + push the nginx image"; \
	echo "      -- --deploy               ...and roll it out"; \
	echo "      -- --local                build the image, do not push"; \
	echo "      -- --skip-bundle          reuse web/web"; \
	echo "      -- --serve                export and serve on :8081, package nothing"; \
	echo "  make deploy-web TAG=1.5.52    deploy one tag"; \
	echo; \
	echo "  make version | version-check  write the api version into every frontend / report drift"; \
	echo "  make test | lint | deps       api + app jest, eslint, install both"; \
	echo "  make dev-api | dev-app        tsx watch / expo start"; \
	echo "  make scripts                  what each script in scripts/ is for"; \
	echo; \
	echo "  make -n <target> ...          print what would run, run nothing"; \
	echo "  API_URL=http://192.168.1.5:3000 make desktop   # build against another backend"

# ---------------------------------------------------------------------------
# flags
# ---------------------------------------------------------------------------
# make sees every flag as a goal of its own; these absorb them. Both spellings
# are listed so `--dmg` and `dmg` both work, and a word that is NOT here fails
# loudly ("No rule to make target") instead of being silently ignored as a typo.
FLAG_WORDS := \
  dmg pkg skip-bundle run unsigned upload mas electron local serve deploy redeploy \
  no-submit no-upload no-prebuild no-deploy no-bump bump-minor bump-major submit-last \
  arm64 x64 universal \
  --dmg --pkg --skip-bundle --run --install --unsigned --upload --mas --electron \
  --local --serve --deploy --redeploy --no-submit --no-upload --no-prebuild \
  --no-deploy --no-bump --bump-minor --bump-major --submit-last --arch

.PHONY: $(FLAG_WORDS)
$(FLAG_WORDS):
	@:
