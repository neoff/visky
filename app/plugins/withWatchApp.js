const {withDangerousMod, withXcodeProject} = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

/**
 * Adds the Apple Watch app to the Xcode project during prebuild.
 *
 * WHY A PLUGIN AND NOT A COMMIT OF ios/.
 *
 * `ios/` is generated: it is in .gitignore and `expo prebuild` rewrites it. A
 * watch target added by hand in Xcode survives exactly until the next prebuild
 * — and EAS prebuilds on every cloud build, so the target would vanish on the
 * one machine that matters. The sources live in `watch/`, which IS tracked, and
 * this plugin puts them into the project every time it is regenerated. Nothing
 * to force-add, nothing to lose.
 *
 * The target is a SINGLE-target watch app (watchOS 7+): one bundle with
 * `WKApplication` in its Info.plist, no separate WatchKit extension. That is
 * why the product type below is a plain application rather than the
 * `watchapp2` type xcode@3 offers — watchapp2 describes the old two-bundle
 * layout and expects an extension inside.
 */

const TARGET_NAME = 'viskyWatch'
/** Both inside ios/ and as the Xcode group name. */
const TARGET_DIR = 'viskyWatch'
/** Must be prefixed with the phone app's id; WatchConnectivity pairs on it. */
const BUNDLE_SUFFIX = 'watchkitapp'
const ASSET_CATALOG = 'Assets.xcassets'
const WATCHOS_DEPLOYMENT_TARGET = '10.0'

const copySources = (config) =>
  withDangerousMod(config, [
    'ios',
    async (config) => {
      const from = path.join(config.modRequest.projectRoot, 'watch')
      const to = path.join(config.modRequest.platformProjectRoot, TARGET_DIR)

      if (!fs.existsSync(from)) {
        throw new Error(`withWatchApp: no watch sources at ${from}`)
      }

      // Mirror, do not merge: a file deleted from watch/ must disappear here
      // too, or a stale Swift file keeps compiling into the target.
      // Recursive, because Assets.xcassets is a directory.
      fs.rmSync(to, {recursive: true, force: true})
      fs.cpSync(from, to, {recursive: true})

      // WKCompanionAppBundleIdentifier must name the PHONE app exactly.
      // WatchConnectivity pairs on it, and a stale value does not fail loudly —
      // the watch simply never reaches the phone. Rewrite it from the config
      // rather than trusting the checked-in plist to stay in step.
      const bundleId = config.ios?.bundleIdentifier
      if (bundleId) {
        const plistPath = path.join(to, 'Info.plist')
        const plist = fs.readFileSync(plistPath, 'utf8')
        const patched = plist.replace(
          /(<key>WKCompanionAppBundleIdentifier<\/key>\s*<string>)[^<]*(<\/string>)/,
          `$1${bundleId}$2`,
        )
        if (patched === plist && !plist.includes(bundleId)) {
          throw new Error('withWatchApp: could not set WKCompanionAppBundleIdentifier')
        }
        fs.writeFileSync(plistPath, patched)
      }

      return config
    },
  ])

const addTarget = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults

    // Prebuild can run over an existing project; adding the target twice would
    // produce two of everything and a project Xcode refuses to open.
    if (project.pbxTargetByName(TARGET_NAME)) {
      return config
    }

    const bundleId = `${config.ios?.bundleIdentifier ?? 'com.envarg.visky'}.${BUNDLE_SUFFIX}`
    // BASENAMES, not paths. The group below carries `path = viskyWatch` and
    // Xcode joins the two, so a child listed as `viskyWatch/WatchLink.swift`
    // resolves to ios/viskyWatch/viskyWatch/WatchLink.swift — which is exactly
    // the "Build input files cannot be found" this first shipped as.
    const sources = fs
      .readdirSync(path.join(config.modRequest.projectRoot, 'watch'))
      .filter((file) => file.endsWith('.swift'))

    // addTarget makes the phone app depend on the watch app — but only if these
    // two sections already exist. An Expo project has neither (nothing in it
    // depends on anything), and xcode@3 checks for them and silently does
    // NOTHING when they are missing. The result builds: the phone app compiles,
    // the Watch/ folder is created inside it, and the copy phase then fails with
    // "The file viskyWatch.app couldn't be opened" — because without the
    // dependency the watch app was never built at all.
    const objects = project.hash.project.objects
    objects.PBXTargetDependency = objects.PBXTargetDependency || {}
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {}

    const target = project.addTarget(TARGET_NAME, 'application', TARGET_DIR, bundleId)

    // Phases first, empty: addSourceFile appends to the target's Sources phase
    // and needs one to exist.
    project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid)
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid)
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid)

    // ONE file reference per source, shared between the group (what Xcode
    // shows) and the build phase (what compiles). Registering them separately
    // makes two references to the same file, and only one of them resolves.
    const group = project.addPbxGroup([], TARGET_NAME, TARGET_DIR)
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup)

    for (const basename of sources) {
      project.addSourceFile(basename, {target: target.uuid}, group.uuid)
    }

    // The asset catalogue is a folder, and Xcode treats it as ONE resource: it
    // goes into the Resources phase whole, for actool to compile.
    //
    // Spelled out rather than `addResourceFile`, which unconditionally looks up
    // a group literally named "Resources" and throws on a project that has none
    // — and an Expo project has none. This is what addSourceFile does, aimed at
    // the Resources phase instead.
    const asset = project.addFile(ASSET_CATALOG, group.uuid, {target: target.uuid})
    if (asset) {
      asset.uuid = project.generateUuid()
      asset.target = target.uuid
      project.addToPbxBuildFileSection(asset)
      project.addToPbxResourcesBuildPhase(asset)
    }

    // Embed the built watch app inside the phone app. `watch2_app` here selects
    // the destination (dstSubfolderSpec 16, products directory) — it says where
    // the file goes, not what kind of target we built.
    project.addBuildPhase(
      [`${TARGET_NAME}.app`],
      'PBXCopyFilesBuildPhase',
      'Embed Watch Content',
      project.getFirstTarget().uuid,
      'watch2_app',
      '"$(CONTENTS_FOLDER_PATH)/Watch"',
    )

    const settings = {
      SDKROOT: 'watchos',
      SUPPORTED_PLATFORMS: '"watchos watchsimulator"',
      // 4 is Apple Watch. Inheriting the phone's 1,2 builds an iOS app that
      // cannot be installed anywhere.
      TARGETED_DEVICE_FAMILY: '4',
      WATCHOS_DEPLOYMENT_TARGET: WATCHOS_DEPLOYMENT_TARGET,
      // Ours is hand-written (WKApplication, WKCompanionAppBundleIdentifier),
      // so Xcode must not synthesise one over it.
      GENERATE_INFOPLIST_FILE: 'NO',
      // Without this the watch app ships with a blank icon — it builds, so the
      // only place it shows up is on the wrist.
      ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
      INFOPLIST_FILE: `${TARGET_DIR}/Info.plist`,
      PRODUCT_BUNDLE_IDENTIFIER: `"${bundleId}"`,
      PRODUCT_NAME: '"$(TARGET_NAME)"',
      CURRENT_PROJECT_VERSION: '1',
      MARKETING_VERSION: `"${config.version ?? '1.0.0'}"`,
      SWIFT_VERSION: '5.0',
      SWIFT_EMIT_LOC_STRINGS: 'YES',
      CLANG_ENABLE_MODULES: 'YES',
      ALWAYS_SEARCH_USER_PATHS: 'NO',
      LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks"',
      CODE_SIGN_STYLE: 'Automatic',
      // Embedded in the phone app, so it is not installed on its own.
      SKIP_INSTALL: 'YES',
    }

    const configurations = project.pbxXCBuildConfigurationSection()
    for (const key of Object.keys(configurations)) {
      const entry = configurations[key]
      if (typeof entry !== 'object' || !entry.buildSettings) continue
      if (entry.buildSettings.PRODUCT_NAME !== `"${TARGET_NAME}"`) continue
      Object.assign(entry.buildSettings, settings)
    }

    return config
  })

module.exports = (config) => addTarget(copySources(config))
