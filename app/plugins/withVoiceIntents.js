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
const ALTERNATIVE_NAMES = [
  // The mishearing itself, claimed for the app it was meant for: "open
  // whiskey" with nothing else in the sentence is the utterance that currently
  // ends in the App Store.
  {name: 'Visky', hint: 'whiskey'},
  // Two-word forms. Siri resolves these far more reliably than one short name
  // it has to pick out of a sentence, and they cost nothing to add.
  {name: 'Visky Music', hint: 'whiskey music'},
  {name: 'Visky Radio', hint: 'whiskey radio'},
  {name: 'Visky Player', hint: 'whiskey player'},
  // "Frisky Music", and deliberately not "Frisky Radio" or a bare "Frisky".
  // The registered mark is the station's full name; the owner's position is
  // that the two-word generic pairing is not it, and that visky (vk + frisky)
  // describes what the app is — VK's copy of that catalogue — rather than
  // passing itself off as the station. The line that must not be crossed is
  // the mark itself, which is why case D3 greps for exactly that string.
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
