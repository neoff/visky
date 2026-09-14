const {withInfoPlist} = require('@expo/config-plugins')

/**
 * Teaches Siri how this app's name SOUNDS.
 *
 * "Hey Siri, open visky" does not open visky. It offers to buy an app called
 * Whisky, because that is what the name sounds like out loud and Siri matches
 * what it heard, not what is spelled on the home screen. The app cannot be
 * renamed out of the problem either: the name is the product's identity, and
 * the obvious spoken alternatives belong to somebody else — Frisky is a
 * registered radio station, and this app deliberately is not it (it plays what
 * VK hosts, which is the whole reason for the V).
 *
 * `INAlternativeAppNames` is Apple's answer to exactly this. Each entry is an
 * extra name the system accepts for THIS app, with a hint for how it is
 * pronounced, and neither changes a single pixel of what is shown under the
 * icon. The hints are the load-bearing half: they are what let the sound Siri
 * actually heard — "whiskey" — resolve here instead of to the App Store.
 *
 * NOTHING HERE CLAIMS SOMEBODY ELSE'S NAME, and nothing here should start to.
 * An alternate name is a claim on a spoken phrase: adding a competitor's brand
 * would hand their listeners to this app when they ask for theirs, which is
 * the counterfeit problem in a different costume, and App Review treats a
 * trademark in app metadata the same way whatever field it sits in.
 *
 * Android has no equivalent list — Assistant matches the launcher label and the
 * Play listing title, and there is nowhere to add a pronunciation to.
 */
// THREE, AND NOT ONE MORE. iOS rejects the app at INSTALL time with
// "has N INAlternativeAppNames in its Info.plist, maximum of 3 allowed" —
// not at build time, not in review, so a fourth entry looks fine until the
// day nothing will install. Chosen for coverage of three different failures:
const ALTERNATIVE_NAMES = [
  // 1. The mishearing. "Open visky" sounds like whiskey and used to answer
  //    with the Whisky app in the App Store.
  {name: 'Visky', hint: 'whiskey'},
  // 2. The two-word form of the app's own name, which Siri resolves far more
  //    reliably than one short word inside a sentence.
  {name: 'Visky Music', hint: 'whiskey music'},
  // 3. What people actually say when they mean this music. Deliberately not
  //    "Frisky Radio" and not a bare "Frisky": the registered mark is the
  //    station's full name, and case D3 greps for exactly that string so a
  //    later edit trips over it.
  {name: 'Frisky Music', hint: 'frisky music'},
]

const withVoiceIntents = (config) =>
  withInfoPlist(config, (mod) => {
    mod.modResults.INAlternativeAppNames = ALTERNATIVE_NAMES.map((entry) => ({
      INAlternativeAppName: entry.name,
      INAlternativeAppNamePronunciationHint: entry.hint,
    }))
    return mod
  })

module.exports = withVoiceIntents
